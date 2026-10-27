import { z } from 'zod';
import {
  Reservation,
  Room,
  Property,
  RoomType,
  RoomPricing,
  Coupon,
  CouponRedemption,
  Inventory,
  AuditLog,
  Payment,
  Refund,
} from '../models/index.js';
import { validateDateRange, generateNightsList } from '../utils/dates.js';
import { calculateReservationQuote } from '../services/pricingService.js';
import { validateCoupon, redeemCouponAtomically } from '../services/couponService.js';
import {
  transitionReservation,
  calculateCancellationRefund,
} from '../services/reservationStateMachine.js';
import {
  getNextBusinessId,
  getNextReservationNumber,
  generateRefundReference,
} from '../utils/idGenerator.js';
import { getRoleScope, enforceResourceOwnership } from '../middlewares/roleScope.js';
import { runInTransaction } from '../utils/transaction.js';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

// Strict schema for Reservation Quote: reject manipulated prices or unknown fields
export const quoteSchema = z
  .object({
    property_id: z.string().trim().min(1, 'Property ID is required'),
    room_id: z.string().trim().min(1, 'Room ID is required'),
    check_in_date: z.string().trim().min(1, 'Check-in date is required'),
    check_out_date: z.string().trim().min(1, 'Check-out date is required'),
    guests_count: z.coerce.number().int().min(1).default(1),
    coupon_code: z.string().trim().optional(),
  })
  .strict();

// Strict schema for Reservation Creation: client may send ONLY whitelisted booking parameters
export const createReservationSchema = z
  .object({
    property_id: z.string().trim().min(1, 'Property ID is required'),
    room_id: z.string().trim().min(1, 'Room ID is required'),
    check_in_date: z.string().trim().min(1, 'Check-in date is required'),
    check_out_date: z.string().trim().min(1, 'Check-out date is required'),
    guests_count: z.coerce.number().int().min(1).default(1),
    coupon_code: z.string().trim().optional(),
  })
  .strict();

// Strict schema for Reservation Cancellation
export const cancelReservationSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

/**
 * Checks for prohibited client-manipulated financial fields.
 * Defense-in-depth against Price Manipulation attacks.
 */
const assertNoManipulatedFinancialFields = (body) => {
  const disallowedFields = [
    'price',
    'base_amount',
    'discount',
    'discount_amount',
    'tax',
    'tax_amount',
    'service_fee',
    'total_amount',
    'status',
    'hold_expires_at',
  ];

  for (const field of disallowedFields) {
    if (field in body) {
      throw new BadRequestError(
        `Field '${field}' is strictly forbidden. Pricing is calculated exclusively by the server.`,
        null,
        'PRICE_MANIPULATION_DETECTED'
      );
    }
  }
};

/**
 * Checks for prohibited client-manipulated refund fields.
 * Defense-in-depth against Refund Manipulation attacks.
 */
const assertNoManipulatedRefundFields = (body) => {
  const disallowed = [
    'refund_amount',
    'cancellation_fee',
    'original_amount',
    'amount',
    'tier',
    'refund_percentage',
  ];
  if (body) {
    for (const field of disallowed) {
      if (field in body) {
        throw new BadRequestError(
          `Field '${field}' is strictly forbidden. Refunds are calculated exclusively by the server.`,
          null,
          'REFUND_MANIPULATION_DETECTED'
        );
      }
    }
  }
};

/**
 * POST /api/v1/reservations/quote
 * Returns full server-side price breakdown without creating a reservation.
 * Fully validates coupons server-side.
 */
export const getQuote = async (req, res, next) => {
  try {
    assertNoManipulatedFinancialFields(req.body);

    const { property_id, room_id, check_in_date, check_out_date, guests_count, coupon_code } =
      req.body;

    const { checkInUtc, checkOutUtc } = validateDateRange(check_in_date, check_out_date);
    const nightsList = generateNightsList(checkInUtc, checkOutUtc);

    // Check whether the requested room has booked inventory for requested dates
    const bookedInventory = await Inventory.find({
      room_id,
      date: { $in: nightsList },
    }).lean();
    const isAvailable = bookedInventory.length === 0;

    // Validate Property
    const property = await Property.findOne({ property_id, status: 'ACTIVE' }).lean();
    if (!property) {
      throw new NotFoundError('Property not found or is inactive');
    }

    // Validate Room
    const room = await Room.findOne({
      room_id,
      property_id,
      status: { $in: ['AVAILABLE', 'ACTIVE'] },
    }).lean();
    if (!room) {
      throw new NotFoundError('Room not found or unavailable');
    }

    if (guests_count > room.max_guests) {
      throw new BadRequestError(
        `Guest count (${guests_count}) exceeds room capacity (${room.max_guests})`,
        null,
        'CAPACITY_EXCEEDED'
      );
    }

    const roomType = await RoomType.findOne({ room_type_id: room.room_type_id }).lean();
    if (!roomType) {
      throw new NotFoundError('Room type details not found');
    }

    const pricingRules = await RoomPricing.find({
      room_type_id: room.room_type_id,
      status: 'ACTIVE',
    }).lean();

    // 1. Calculate raw quote to obtain base_amount
    const rawQuote = calculateReservationQuote({
      roomType,
      pricingRules,
      checkInDate: checkInUtc,
      checkOutDate: checkOutUtc,
      guestsCount: guests_count,
      coupon: null,
    });

    // 2. Validate coupon if provided
    let verifiedCoupon = null;
    if (coupon_code) {
      const validation = await validateCoupon(coupon_code, rawQuote.base_amount, {
        propertyId: property_id,
        guestId: req.user?.guest_id,
      });
      verifiedCoupon = validation.coupon;
    }

    // 3. Final quote with verified coupon
    const quote = calculateReservationQuote({
      roomType,
      pricingRules,
      checkInDate: checkInUtc,
      checkOutDate: checkOutUtc,
      guestsCount: guests_count,
      coupon: verifiedCoupon,
      context: { propertyId: property_id, guestId: req.user?.guest_id },
    });

    return res.status(200).json({
      property_id,
      room_id,
      is_available: isAvailable,
      conflict_dates: bookedInventory.map((i) => i.date.toISOString().split('T')[0]),
      quote,
      coupon: verifiedCoupon
        ? {
            code: verifiedCoupon.code,
            discount_type: verifiedCoupon.discount_type,
            discount_value: verifiedCoupon.discount_value,
            discount_amount: quote.discount_amount,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reservations
 * Creates a new reservation inside a MongoDB transaction.
 *
 * Enforces:
 * - Direct Inventory insertion: does NOT query for overlap then insert.
 * - Any E11000 duplicate key error immediately aborts transaction and returns 409 Conflict.
 * - Atomic coupon redemption inside the same transaction with findOneAndUpdate.
 * - Retries transient transaction errors bounded number of times.
 * - Holds room for 15 minutes (hold_expires_at = now + 15m).
 * - Writes audit log atomically.
 */
export const createReservation = async (req, res, next) => {
  try {
    assertNoManipulatedFinancialFields(req.body);

    if (!req.user || !req.user.guest_id) {
      throw new UnauthorizedError('Guest profile required to create a reservation');
    }

    const { property_id, room_id, check_in_date, check_out_date, guests_count, coupon_code } =
      req.body;

    const { checkInUtc, checkOutUtc, nights } = validateDateRange(check_in_date, check_out_date);
    const nightsList = generateNightsList(checkInUtc, checkOutUtc);

    let createdReservationId = null;
    let redeemedCouponId = null;

    const result = await runInTransaction(
      async (session, _isTransactional) => {
        const queryOpts = session ? { session } : {};

        // 1. Validate Property
        const property = await Property.findOne(
          { property_id, status: 'ACTIVE' },
          null,
          queryOpts
        ).lean();
        if (!property) {
          throw new NotFoundError('Property not found or is inactive');
        }

        // 2. Validate Room
        const room = await Room.findOne(
          { room_id, property_id, status: { $in: ['AVAILABLE', 'ACTIVE'] } },
          null,
          queryOpts
        ).lean();
        if (!room) {
          throw new NotFoundError(
            'Room not found, inactive, or does not belong to specified property'
          );
        }

        // 2b. Validate Room Availability for requested nights
        const existingInventory = await Inventory.find(
          {
            room_id,
            date: { $in: nightsList },
          },
          null,
          queryOpts
        ).lean();

        if (existingInventory.length > 0) {
          throw new ConflictError(
            'The requested room is already reserved for one or more of the selected dates. Please choose different dates or rooms.',
            null,
            'ROOM_ALREADY_BOOKED'
          );
        }

        // 3. Validate Capacity
        if (guests_count > room.max_guests) {
          throw new BadRequestError(
            `Guests count (${guests_count}) exceeds room maximum capacity (${room.max_guests})`,
            null,
            'CAPACITY_EXCEEDED'
          );
        }

        // 4. Fetch Room Type and Pricing Rules
        const roomType = await RoomType.findOne(
          { room_type_id: room.room_type_id },
          null,
          queryOpts
        ).lean();
        if (!roomType) {
          throw new NotFoundError('Room type details not found');
        }

        const pricingRules = await RoomPricing.find(
          { room_type_id: room.room_type_id, status: 'ACTIVE' },
          null,
          queryOpts
        ).lean();

        // 5. Calculate base price to validate coupon
        const rawQuote = calculateReservationQuote({
          roomType,
          pricingRules,
          checkInDate: checkInUtc,
          checkOutDate: checkOutUtc,
          guestsCount: guests_count,
          coupon: null,
        });

        // 6. Validate Coupon if provided
        let verifiedCoupon = null;
        if (coupon_code) {
          const couponValidation = await validateCoupon(
            coupon_code,
            rawQuote.base_amount,
            {
              propertyId: property_id,
              guestId: req.user.guest_id,
            },
            queryOpts
          );
          verifiedCoupon = couponValidation.coupon;
        }

        // 7. Compute final price server-side
        const quote = calculateReservationQuote({
          roomType,
          pricingRules,
          checkInDate: checkInUtc,
          checkOutDate: checkOutUtc,
          guestsCount: guests_count,
          coupon: verifiedCoupon,
          context: { propertyId: property_id, guestId: req.user.guest_id },
        });

        // 8. Generate Business IDs
        const reservationId = await getNextBusinessId(Reservation, 'reservation_id', 'RES-', 3);
        const reservationNumber = await getNextReservationNumber(Reservation);
        const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // Now + 15 minutes

        createdReservationId = reservationId;

        // 9. Create Reservation document in PENDING status
        const [reservation] = await Reservation.create(
          [
            {
              reservation_id: reservationId,
              reservation_number: reservationNumber,
              guest_id: req.user.guest_id,
              property_id,
              room_id,
              check_in_date: checkInUtc,
              check_out_date: checkOutUtc,
              guests_count,
              base_amount: quote.base_amount,
              discount_amount: quote.discount_amount,
              tax_amount: quote.tax_amount,
              service_fee: quote.service_fee,
              total_amount: quote.total_amount,
              status: 'PENDING',
              hold_expires_at: holdExpiresAt,
              cancellation_policy: 'FLEXIBLE',
            },
          ],
          queryOpts
        );

        // 10. Atomic Coupon Redemption inside transaction
        if (verifiedCoupon && quote.discount_amount > 0) {
          await redeemCouponAtomically(
            verifiedCoupon,
            reservation.reservation_id,
            req.user.guest_id,
            quote.discount_amount,
            queryOpts
          );
          redeemedCouponId = verifiedCoupon.coupon_id;
        }

        // 11. Insert one Inventory document per night
        // Direct insertion: The compound UNIQUE index { room_id, date } prevents double-booking
        const inventoryDocs = nightsList.map((nightDate) => ({
          inventory_id: `INV-${room_id}-${nightDate.toISOString().split('T')[0]}`,
          room_id,
          date: nightDate,
          reservation_id: reservation.reservation_id,
          status: 'HOLD',
        }));

        try {
          await Inventory.insertMany(inventoryDocs, { ...queryOpts, ordered: true });
        } catch (invErr) {
          // If duplicate key error E11000 on Inventory, the room is already booked/held!
          if (invErr.code === 11000 || (invErr.message && invErr.message.includes('E11000'))) {
            logger.warn(
              `Concurrent reservation conflict on room ${room_id} for requested dates. Returning 409 Conflict.`
            );
            throw new ConflictError(
              'The requested room is already reserved for one or more of the selected dates. Please choose different dates or rooms.',
              null,
              'ROOM_ALREADY_BOOKED'
            );
          }
          throw invErr;
        }

        // 12. Write Audit Log atomically inside the same transaction
        const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
        await AuditLog.create(
          [
            {
              audit_id: auditId,
              user_id: req.user.user_id,
              action: 'RESERVATION_CREATED',
              entity_type: 'RESERVATION',
              entity_id: reservation.reservation_id,
              metadata: {
                room_id,
                property_id,
                check_in_date: checkInUtc.toISOString(),
                check_out_date: checkOutUtc.toISOString(),
                nights,
                total_amount: quote.total_amount,
                coupon_code: verifiedCoupon?.code || null,
                discount_amount: quote.discount_amount,
                hold_expires_at: holdExpiresAt.toISOString(),
              },
            },
          ],
          queryOpts
        );

        logger.info(
          `Reservation ${reservation.reservation_id} created successfully for room ${room_id} (${nights} nights)`
        );

        return {
          reservation,
          pricing_breakdown: quote,
        };
      },
      {
        onCompensation: async () => {
          if (createdReservationId) {
            await Reservation.deleteOne({ reservation_id: createdReservationId });
            await Inventory.deleteMany({ reservation_id: createdReservationId });
          }
          if (redeemedCouponId && createdReservationId) {
            await Coupon.updateOne({ coupon_id: redeemedCouponId }, { $inc: { used_count: -1 } });
            await CouponRedemption.deleteOne({ reservation_id: createdReservationId });
          }
        },
      }
    );

    return res.status(201).json({
      message: 'Reservation created successfully with a 15-minute hold',
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reservations
 * Retrieves reservations scoped by caller's role.
 */
export const listReservations = async (req, res, next) => {
  try {
    const roleFilter = await getRoleScope(req.user, {
      guestField: 'guest_id',
      propertyField: 'property_id',
    });

    const filter = { ...roleFilter };

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.property_id) {
      filter.property_id = req.query.property_id;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      Reservation.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      Reservation.countDocuments(filter),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      count: reservations.length,
      reservations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reservations/:id
 * Retrieves single reservation with strict ownership enforcement:
 * Returns 404 (NOT 403) if caller does not own the reservation.
 */
export const getReservationById = async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({ reservation_id: req.params.id }).lean();

    const authorizedReservation = await enforceResourceOwnership(reservation, req.user, {
      resourceName: 'Reservation',
      guestField: 'guest_id',
      propertyField: 'property_id',
    });

    return res.status(200).json({
      reservation: authorizedReservation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reservations/:id/check-in
 * Checks in a reservation (CONFIRMED -> CHECKED_IN).
 * Rules:
 * - Only ADMIN or the property's PROPERTY_MANAGER can check in.
 * - Allowed only on or after the scheduled check_in_date.
 * - Cancelled reservations can NEVER be checked in (409 Conflict).
 */
export const checkInReservation = async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({ reservation_id: req.params.id }).lean();
    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    // Role check: Only ADMIN or property's PROPERTY_MANAGER
    if (req.user.role === 'GUEST') {
      throw new ForbiddenError('Only property managers and administrators can check in guests');
    }

    if (req.user.role === 'PROPERTY_MANAGER') {
      const isManager = await Property.exists({
        property_id: reservation.property_id,
        manager_user_id: req.user.user_id,
      });
      if (!isManager) {
        throw new NotFoundError('Reservation not found');
      }
    }

    // Status transition rules:
    // A CANCELLED reservation can never be checked in
    if (
      reservation.status === 'CANCELLED' ||
      reservation.status === 'REFUND_PENDING' ||
      reservation.status === 'REFUNDED'
    ) {
      throw new ConflictError(
        'A cancelled reservation can never be checked in',
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    if (reservation.status !== 'CONFIRMED') {
      throw new ConflictError(
        `Cannot check in reservation in ${reservation.status} status. Only CONFIRMED reservations can be checked in.`,
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    // Date check: Check-in only on or after the check-in date
    const checkInDate = new Date(reservation.check_in_date);
    const now = new Date();
    if (now.getTime() < checkInDate.getTime()) {
      throw new BadRequestError(
        `Check-in is only permitted on or after the scheduled check-in date (${checkInDate.toISOString().split('T')[0]})`,
        null,
        'CHECKIN_TOO_EARLY'
      );
    }

    // Atomic conditional state transition in transaction
    const result = await runInTransaction(async (session) => {
      const queryOpts = session ? { session } : {};

      const updatedReservation = await transitionReservation({
        reservationId: reservation.reservation_id,
        fromStatus: 'CONFIRMED',
        toStatus: 'CHECKED_IN',
        options: { session },
      });

      // Write audit log
      const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
      await AuditLog.create(
        [
          {
            audit_id: auditId,
            user_id: req.user.user_id,
            action: 'RESERVATION_CHECKED_IN',
            entity_type: 'RESERVATION',
            entity_id: reservation.reservation_id,
            metadata: {
              checked_in_by: req.user.user_id,
              property_id: reservation.property_id,
              check_in_date: reservation.check_in_date,
            },
          },
        ],
        queryOpts
      );

      return updatedReservation;
    });

    return res.status(200).json({
      message: 'Guest checked in successfully',
      reservation: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reservations/:id/check-out
 * Checks out a reservation (CHECKED_IN -> CHECKED_OUT).
 * Rules:
 * - Only ADMIN or the property's PROPERTY_MANAGER can check out.
 */
export const checkOutReservation = async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({ reservation_id: req.params.id }).lean();
    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    // Role check: Only ADMIN or property's PROPERTY_MANAGER
    if (req.user.role === 'GUEST') {
      throw new ForbiddenError('Only property managers and administrators can check out guests');
    }

    if (req.user.role === 'PROPERTY_MANAGER') {
      const isManager = await Property.exists({
        property_id: reservation.property_id,
        manager_user_id: req.user.user_id,
      });
      if (!isManager) {
        throw new NotFoundError('Reservation not found');
      }
    }

    if (reservation.status !== 'CHECKED_IN') {
      throw new ConflictError(
        `Cannot check out reservation in ${reservation.status} status. Only CHECKED_IN reservations can be checked out.`,
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    // Atomic conditional state transition in transaction
    const result = await runInTransaction(async (session) => {
      const queryOpts = session ? { session } : {};

      const updatedReservation = await transitionReservation({
        reservationId: reservation.reservation_id,
        fromStatus: 'CHECKED_IN',
        toStatus: 'CHECKED_OUT',
        options: { session },
      });

      // Write audit log
      const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
      await AuditLog.create(
        [
          {
            audit_id: auditId,
            user_id: req.user.user_id,
            action: 'RESERVATION_CHECKED_OUT',
            entity_type: 'RESERVATION',
            entity_id: reservation.reservation_id,
            metadata: {
              checked_out_by: req.user.user_id,
              property_id: reservation.property_id,
            },
          },
        ],
        queryOpts
      );

      return updatedReservation;
    });

    return res.status(200).json({
      message: 'Guest checked out successfully',
      reservation: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/reservations/:id/cancellation-preview
 * Displays refund tier calculation before cancellation is confirmed.
 */
export const getCancellationPreview = async (req, res, next) => {
  try {
    const reservation = await Reservation.findOne({ reservation_id: req.params.id }).lean();

    // Verify ownership / authorization (Guest owner, Property Manager, or Admin)
    const authorizedReservation = await enforceResourceOwnership(reservation, req.user, {
      resourceName: 'Reservation',
      guestField: 'guest_id',
      propertyField: 'property_id',
    });

    if (authorizedReservation.status === 'CHECKED_OUT') {
      throw new ConflictError(
        'A checked-out reservation can never be cancelled',
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    if (
      authorizedReservation.status === 'CANCELLED' ||
      authorizedReservation.status === 'REFUND_PENDING' ||
      authorizedReservation.status === 'REFUNDED'
    ) {
      throw new ConflictError(
        'Reservation is already cancelled',
        null,
        'RESERVATION_ALREADY_CANCELLED'
      );
    }

    if (
      authorizedReservation.status !== 'PENDING' &&
      authorizedReservation.status !== 'CONFIRMED'
    ) {
      throw new ConflictError(
        `Cannot cancel reservation in ${authorizedReservation.status} status`,
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    // Check if successful payment exists
    const payment = await Payment.findOne({
      reservation_id: authorizedReservation.reservation_id,
      status: 'SUCCESS',
    }).lean();

    const originalAmount = payment ? payment.amount : 0;
    const refundCalc = calculateCancellationRefund(
      authorizedReservation.check_in_date,
      originalAmount
    );

    return res.status(200).json({
      reservation_id: authorizedReservation.reservation_id,
      status: authorizedReservation.status,
      check_in_date: authorizedReservation.check_in_date,
      hours_until_check_in: refundCalc.hoursUntilCheckIn,
      refund_tier: refundCalc.tier,
      refund_percentage: refundCalc.refundPercentage,
      original_amount: refundCalc.originalAmount,
      cancellation_fee: refundCalc.cancellationFee,
      refund_amount: refundCalc.refundAmount,
      has_successful_payment: Boolean(payment),
      can_cancel: true,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/reservations/:id/cancel
 * Cancels a reservation.
 * Rules:
 * - Guest owner, or admin/manager of the property.
 * - CHECKED_OUT can NEVER be cancelled (409 Conflict).
 * - Deletes inventory documents in the same transaction.
 * - If successful payment exists: moves to REFUND_PENDING and creates Refund document.
 * - If no payment exists: status moves to CANCELLED.
 * - Writes audit log.
 */
export const cancelReservation = async (req, res, next) => {
  try {
    assertNoManipulatedRefundFields(req.body);

    const reservation = await Reservation.findOne({ reservation_id: req.params.id }).lean();

    // Verify ownership / authorization (Guest owner, Property Manager, or Admin)
    const authorizedReservation = await enforceResourceOwnership(reservation, req.user, {
      resourceName: 'Reservation',
      guestField: 'guest_id',
      propertyField: 'property_id',
    });

    if (authorizedReservation.status === 'CHECKED_OUT') {
      throw new ConflictError(
        'A checked-out reservation can never be cancelled',
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    if (
      authorizedReservation.status === 'CANCELLED' ||
      authorizedReservation.status === 'REFUND_PENDING' ||
      authorizedReservation.status === 'REFUNDED'
    ) {
      throw new ConflictError(
        'Reservation is already cancelled',
        null,
        'RESERVATION_ALREADY_CANCELLED'
      );
    }

    if (
      authorizedReservation.status !== 'PENDING' &&
      authorizedReservation.status !== 'CONFIRMED'
    ) {
      throw new ConflictError(
        `Cannot cancel reservation in ${authorizedReservation.status} status`,
        null,
        'INVALID_STATE_TRANSITION'
      );
    }

    const { reason } = req.body || {};
    const idempotencyKey =
      req.headers['idempotency-key']?.trim() ||
      `idem-cancel-${authorizedReservation.reservation_id}`;

    const currentStatus = authorizedReservation.status;

    const result = await runInTransaction(async (session) => {
      const queryOpts = session ? { session } : {};

      // 1. Delete inventory documents in the same transaction
      await Inventory.deleteMany(
        { reservation_id: authorizedReservation.reservation_id },
        queryOpts
      );

      if (currentStatus === 'PENDING') {
        // Transition PENDING -> CANCELLED
        const updatedRes = await transitionReservation({
          reservationId: authorizedReservation.reservation_id,
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          options: { session },
        });

        // Revert any coupon redemption
        const redemptions = await CouponRedemption.find(
          {
            reservation_id: authorizedReservation.reservation_id,
            status: { $in: ['PENDING', 'SUCCESS'] },
          },
          null,
          queryOpts
        );
        for (const red of redemptions) {
          await Coupon.updateOne(
            { coupon_id: red.coupon_id, used_count: { $gt: 0 } },
            { $inc: { used_count: -1 } },
            queryOpts
          );
          red.status = 'REVERTED';
          await red.save(queryOpts);
        }

        // Audit log
        const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
        await AuditLog.create(
          [
            {
              audit_id: auditId,
              user_id: req.user.user_id,
              action: 'RESERVATION_CANCELLED',
              entity_type: 'RESERVATION',
              entity_id: authorizedReservation.reservation_id,
              metadata: {
                cancelled_by: req.user.user_id,
                previous_status: 'PENDING',
                refund_created: false,
                reason: reason || 'Cancelled by user',
              },
            },
          ],
          queryOpts
        );

        return {
          message: 'Reservation cancelled successfully',
          reservation: updatedRes,
          refund: null,
        };
      }

      // If status is CONFIRMED
      // Step A: Transition CONFIRMED -> CANCELLED
      await transitionReservation({
        reservationId: authorizedReservation.reservation_id,
        fromStatus: 'CONFIRMED',
        toStatus: 'CANCELLED',
        options: { session },
      });

      // Step B: Check for successful payment
      const payment = await Payment.findOne(
        {
          reservation_id: authorizedReservation.reservation_id,
          status: 'SUCCESS',
        },
        null,
        queryOpts
      );

      if (!payment) {
        // No payment: Remains CANCELLED
        const updatedRes = await Reservation.findOne(
          { reservation_id: authorizedReservation.reservation_id },
          null,
          queryOpts
        );

        const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
        await AuditLog.create(
          [
            {
              audit_id: auditId,
              user_id: req.user.user_id,
              action: 'RESERVATION_CANCELLED',
              entity_type: 'RESERVATION',
              entity_id: authorizedReservation.reservation_id,
              metadata: {
                cancelled_by: req.user.user_id,
                previous_status: 'CONFIRMED',
                refund_created: false,
                reason: reason || 'Cancelled by user',
              },
            },
          ],
          queryOpts
        );

        return {
          message: 'Reservation cancelled successfully',
          reservation: updatedRes,
          refund: null,
        };
      }

      // If payment exists: Transition CANCELLED -> REFUND_PENDING
      const updatedRes = await transitionReservation({
        reservationId: authorizedReservation.reservation_id,
        fromStatus: 'CANCELLED',
        toStatus: 'REFUND_PENDING',
        hasSuccessfulPayment: true,
        options: { session },
      });

      // Calculate refund breakdown
      const refundCalc = calculateCancellationRefund(
        authorizedReservation.check_in_date,
        payment.amount
      );

      const refundId = await getNextBusinessId(Refund, 'refund_id', 'REF-', 3);
      const refundRef = generateRefundReference();

      // Create Refund record
      const [refundDoc] = await Refund.create(
        [
          {
            refund_id: refundId,
            refund_reference: refundRef,
            reservation_id: authorizedReservation.reservation_id,
            payment_id: payment.payment_id,
            guest_id: authorizedReservation.guest_id,
            original_amount: refundCalc.originalAmount,
            cancellation_fee: refundCalc.cancellationFee,
            refund_amount: refundCalc.refundAmount,
            reason: reason || 'Guest requested cancellation',
            status: 'PENDING',
            idempotency_key: idempotencyKey,
            refunded_at: null,
          },
        ],
        queryOpts
      );

      // Write Audit Log for REFUND_INITIATED
      const auditRefundId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
      await AuditLog.create(
        [
          {
            audit_id: auditRefundId,
            user_id: req.user.user_id,
            action: 'REFUND_INITIATED',
            entity_type: 'REFUND',
            entity_id: refundId,
            metadata: {
              reservation_id: authorizedReservation.reservation_id,
              original_amount: refundCalc.originalAmount,
              refund_amount: refundCalc.refundAmount,
              cancellation_fee: refundCalc.cancellationFee,
              tier: refundCalc.tier,
              idempotency_key: idempotencyKey,
            },
          },
        ],
        queryOpts
      );

      // Write Audit Log for RESERVATION_CANCELLED
      const auditResId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
      await AuditLog.create(
        [
          {
            audit_id: auditResId,
            user_id: req.user.user_id,
            action: 'RESERVATION_CANCELLED',
            entity_type: 'RESERVATION',
            entity_id: authorizedReservation.reservation_id,
            metadata: {
              cancelled_by: req.user.user_id,
              previous_status: 'CONFIRMED',
              new_status: 'REFUND_PENDING',
              refund_id: refundId,
              refund_amount: refundCalc.refundAmount,
              reason: reason || 'Guest requested cancellation',
            },
          },
        ],
        queryOpts
      );

      return {
        message: 'Reservation cancelled successfully and refund initiated',
        reservation: updatedRes,
        refund: refundDoc,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export default {
  getQuote,
  createReservation,
  listReservations,
  getReservationById,
  checkInReservation,
  checkOutReservation,
  getCancellationPreview,
  cancelReservation,
};
