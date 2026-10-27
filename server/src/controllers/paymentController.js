import { z } from 'zod';
import { Payment, Reservation, Inventory, CouponRedemption, AuditLog } from '../models/index.js';
import { paymentGateway } from '../services/paymentGateway.js';
import { expireStaleReservations } from '../services/expirationService.js';
import { getNextBusinessId, generatePaymentReference } from '../utils/idGenerator.js';
import { getRoleScope, enforceResourceOwnership } from '../middlewares/roleScope.js';
import { runInTransaction } from '../utils/transaction.js';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
} from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

// Strict schema for payment: client may send ONLY reservation_id and payment_method
export const createPaymentSchema = z
  .object({
    reservation_id: z.string().trim().min(1, 'Reservation ID is required'),
    payment_method: z.enum(['CARD', 'UPI', 'NET_BANKING', 'WALLET', 'CASH'], {
      errorMap: () => ({ message: 'Invalid payment method' }),
    }),
  })
  .strict();

/**
 * Checks for prohibited client-manipulated amount fields.
 */
const assertNoManipulatedAmountFields = (body) => {
  if ('amount' in body || 'price' in body || 'total_amount' in body) {
    throw new BadRequestError(
      'Field amount is strictly forbidden. The payable amount is calculated exclusively by the server.',
      null,
      'AMOUNT_MANIPULATION_DETECTED'
    );
  }
};

/**
 * POST /api/v1/payments
 * Processes payment for a PENDING reservation.
 *
 * Rules:
 * - Requires Idempotency-Key header.
 * - Replays return exact stored original response without re-processing.
 * - Rejects any amount in request body (amount strictly comes from reservation.total_amount).
 * - Reservation must belong to authenticated guest, be PENDING and not expired.
 * - No existing SUCCESS payment for the reservation.
 * - In one transaction on success: payment SUCCESS, reservation CONFIRMED, coupon confirmed, audit log written.
 */
export const processPayment = async (req, res, next) => {
  try {
    assertNoManipulatedAmountFields(req.body);

    if (!req.user || !req.user.guest_id) {
      throw new UnauthorizedError('Guest authentication required to complete payment');
    }

    // 1. Validate Idempotency-Key header
    const idempotencyKey = req.headers['idempotency-key'];
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw new BadRequestError(
        'Idempotency-Key header is required for payment processing',
        null,
        'IDEMPOTENCY_KEY_REQUIRED'
      );
    }
    const cleanIdempotencyKey = idempotencyKey.trim();

    // 2. Check for existing idempotent payment by (idempotency_key + guest_id)
    const existingPayment = await Payment.findOne({
      idempotency_key: cleanIdempotencyKey,
      guest_id: req.user.guest_id,
    }).lean();

    if (existingPayment) {
      logger.info(
        `Idempotent replay detected for key '${cleanIdempotencyKey}'. Returning cached original response.`
      );
      const statusCode = existingPayment.response_status || 200;
      const responseBody = existingPayment.response_body || {
        message: 'Payment already processed successfully',
        payment: existingPayment,
      };
      return res.status(statusCode).json(responseBody);
    }

    const { reservation_id, payment_method } = req.body;

    // 3. Find and validate reservation
    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    // Ownership check (404 rule)
    if (reservation.guest_id !== req.user.guest_id) {
      throw new NotFoundError('Reservation not found');
    }

    // Check reservation status
    if (reservation.status === 'CONFIRMED') {
      throw new BadRequestError(
        'Reservation is already confirmed and paid',
        null,
        'RESERVATION_ALREADY_CONFIRMED'
      );
    }

    if (
      reservation.status === 'REFUNDED' ||
      reservation.status === 'CANCELLED' ||
      reservation.status === 'CHECKED_OUT' ||
      reservation.status === 'EXPIRED'
    ) {
      throw new ConflictError(
        `A ${reservation.status} reservation can never accept a new payment`,
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    if (reservation.status !== 'PENDING') {
      throw new BadRequestError(
        `Reservation is in ${reservation.status} status and cannot be paid`,
        null,
        'INVALID_RESERVATION_STATUS'
      );
    }

    // Check hold expiration
    if (reservation.hold_expires_at && new Date() > new Date(reservation.hold_expires_at)) {
      await expireStaleReservations();
      throw new BadRequestError(
        'Reservation hold has expired. Please search and book again.',
        null,
        'RESERVATION_HOLD_EXPIRED'
      );
    }

    // Check existing successful payment
    const existingSuccessPayment = await Payment.findOne({
      reservation_id: reservation.reservation_id,
      status: 'SUCCESS',
    }).lean();

    if (existingSuccessPayment) {
      throw new ConflictError(
        'A successful payment already exists for this reservation',
        null,
        'PAYMENT_ALREADY_EXISTS'
      );
    }

    // 4. Process payment through mock gateway using trusted server amount
    const gatewayResult = await paymentGateway.processPayment({
      amount: reservation.total_amount,
      currency: 'INR',
      paymentMethod: payment_method,
      reservationId: reservation.reservation_id,
      guestId: req.user.guest_id,
    });

    if (!gatewayResult.success) {
      throw new BadRequestError(
        gatewayResult.errorMessage || 'Payment processing failed',
        null,
        gatewayResult.errorCode || 'PAYMENT_FAILED'
      );
    }

    // 5. Atomic state transition in a single transaction
    let createdPaymentId = null;

    const result = await runInTransaction(
      async (session, _isTransactional) => {
        const queryOpts = session ? { session } : {};

        // Atomically transition reservation from PENDING to CONFIRMED
        const updatedReservation = await Reservation.findOneAndUpdate(
          {
            reservation_id: reservation.reservation_id,
            status: 'PENDING',
            $or: [{ hold_expires_at: null }, { hold_expires_at: { $gt: new Date() } }],
          },
          { $set: { status: 'CONFIRMED' } },
          { new: true, ...queryOpts }
        );

        if (!updatedReservation) {
          throw new ConflictError(
            'Reservation could not be confirmed: concurrent payment processed or hold expired',
            null,
            'RESERVATION_PAYMENT_CONFLICT'
          );
        }

        // Transition temporary inventory holds to confirmed BOOKED status
        await Inventory.updateMany(
          { reservation_id: reservation.reservation_id },
          { $set: { status: 'BOOKED' } },
          queryOpts
        );

        // Generate Business IDs
        const paymentId = await getNextBusinessId(Payment, 'payment_id', 'PAY-', 3);
        const paymentReference = gatewayResult.transactionId || generatePaymentReference();
        createdPaymentId = paymentId;

        // Structured response for current caller and cached idempotent replay
        const responseData = {
          message: 'Payment processed successfully and reservation confirmed',
          payment: {
            payment_id: paymentId,
            payment_reference: paymentReference,
            reservation_id: reservation.reservation_id,
            guest_id: req.user.guest_id,
            amount: reservation.total_amount,
            currency: 'INR',
            payment_method,
            status: 'SUCCESS',
            idempotency_key: cleanIdempotencyKey,
            paid_at: gatewayResult.paidAt,
          },
          reservation: {
            reservation_id: updatedReservation.reservation_id,
            reservation_number: updatedReservation.reservation_number,
            status: updatedReservation.status,
            total_amount: updatedReservation.total_amount,
          },
        };

        // Create Payment record with idempotency cache
        await Payment.create(
          [
            {
              payment_id: paymentId,
              payment_reference: paymentReference,
              reservation_id: reservation.reservation_id,
              guest_id: req.user.guest_id,
              amount: reservation.total_amount,
              currency: 'INR',
              payment_method,
              status: 'SUCCESS',
              idempotency_key: cleanIdempotencyKey,
              paid_at: gatewayResult.paidAt,
              response_status: 200,
              response_body: responseData,
            },
          ],
          queryOpts
        );

        // Mark associated coupon redemption as confirmed and used
        await CouponRedemption.updateOne(
          { reservation_id: reservation.reservation_id },
          { $set: { status: 'USED' } },
          queryOpts
        );

        // Write Audit Log atomically inside transaction
        const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
        await AuditLog.create(
          [
            {
              audit_id: auditId,
              user_id: req.user.user_id,
              action: 'PAYMENT_CREATED',
              entity_type: 'PAYMENT',
              entity_id: paymentId,
              metadata: {
                payment_reference: paymentReference,
                reservation_id: reservation.reservation_id,
                amount: reservation.total_amount,
                idempotency_key: cleanIdempotencyKey,
                payment_method,
              },
            },
          ],
          queryOpts
        );

        return responseData;
      },
      {
        onCompensation: async () => {
          if (createdPaymentId) {
            await Payment.deleteOne({ payment_id: createdPaymentId });
          }
        },
      }
    );

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/payments
 * Retrieves payments scoped by caller's role.
 */
export const listPayments = async (req, res, next) => {
  try {
    const roleFilter = await getRoleScope(req.user, {
      guestField: 'guest_id',
    });

    const filter = { ...roleFilter };

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.reservation_id) {
      filter.reservation_id = req.query.reservation_id;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [payments, total] = await Promise.all([
      Payment.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      Payment.countDocuments(filter),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      count: payments.length,
      payments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/payments/:id
 * Retrieves single payment with strict ownership enforcement:
 * Returns 404 (NOT 403) for other guests' payments.
 */
export const getPaymentById = async (req, res, next) => {
  try {
    const payment = await Payment.findOne({ payment_id: req.params.id }).lean();

    const authorizedPayment = await enforceResourceOwnership(payment, req.user, {
      resourceName: 'Payment',
      guestField: 'guest_id',
    });

    return res.status(200).json({
      payment: authorizedPayment,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  processPayment,
  listPayments,
  getPaymentById,
};
