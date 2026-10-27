import { Refund, Reservation, Property, AuditLog } from '../models/index.js';
import { transitionReservation } from '../services/reservationStateMachine.js';
import { getNextBusinessId } from '../utils/idGenerator.js';
import { runInTransaction } from '../utils/transaction.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors/AppError.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/v1/refunds
 * Lists refunds scoped strictly by caller's role:
 * - GUEST: only their own refunds
 * - PROPERTY_MANAGER: only refunds for properties they manage
 * - ADMIN: all refunds
 */
export const listRefunds = async (req, res, next) => {
  try {
    const filter = {};

    if (req.user.role === 'GUEST') {
      filter.guest_id = req.user.guest_id || '__UNASSOCIATED__';
    } else if (req.user.role === 'PROPERTY_MANAGER') {
      const managedProperties = await Property.find(
        { manager_user_id: req.user.user_id },
        { property_id: 1 }
      ).lean();
      const managedPropIds = managedProperties.map((p) => p.property_id);

      const managedReservations = await Reservation.find(
        { property_id: { $in: managedPropIds } },
        { reservation_id: 1 }
      ).lean();
      const managedResIds = managedReservations.map((r) => r.reservation_id);

      filter.reservation_id = { $in: managedResIds };
    }

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }

    if (req.query.reservation_id) {
      filter.reservation_id = req.query.reservation_id;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [refunds, total] = await Promise.all([
      Refund.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      Refund.countDocuments(filter),
    ]);

    return res.status(200).json({
      page,
      limit,
      total,
      count: refunds.length,
      refunds,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/refunds/:id
 * Retrieves single refund with strict ownership enforcement:
 * Returns 404 (NOT 403) for other guests' refunds to prevent enumeration.
 */
export const getRefundById = async (req, res, next) => {
  try {
    const refund = await Refund.findOne({ refund_id: req.params.id }).lean();
    if (!refund) {
      throw new NotFoundError('Refund not found');
    }

    if (req.user.role === 'ADMIN') {
      return res.status(200).json({ refund });
    }

    if (req.user.role === 'GUEST') {
      if (refund.guest_id !== req.user.guest_id) {
        throw new NotFoundError('Refund not found');
      }
      return res.status(200).json({ refund });
    }

    if (req.user.role === 'PROPERTY_MANAGER') {
      const reservation = await Reservation.findOne({
        reservation_id: refund.reservation_id,
      }).lean();
      if (!reservation) {
        throw new NotFoundError('Refund not found');
      }

      const isManager = await Property.exists({
        property_id: reservation.property_id,
        manager_user_id: req.user.user_id,
      });

      if (!isManager) {
        throw new NotFoundError('Refund not found');
      }

      return res.status(200).json({ refund });
    }

    throw new NotFoundError('Refund not found');
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/refunds/:id/process
 * Processes a refund (REFUND_PENDING -> REFUNDED, refund status PROCESSED).
 *
 * Rules:
 * - Only ADMIN or the property's PROPERTY_MANAGER can process refunds.
 * - Idempotent and concurrency-safe under parallel calls.
 * - In one transaction: transitions reservation to REFUNDED, marks refund PROCESSED, writes audit log.
 */
export const processRefund = async (req, res, next) => {
  try {
    if (req.user.role === 'GUEST') {
      throw new ForbiddenError('Only property managers and administrators can process refunds');
    }

    const refund = await Refund.findOne({ refund_id: req.params.id });
    if (!refund) {
      throw new NotFoundError('Refund not found');
    }

    // Role check for PROPERTY_MANAGER
    if (req.user.role === 'PROPERTY_MANAGER') {
      const reservation = await Reservation.findOne({
        reservation_id: refund.reservation_id,
      }).lean();
      if (!reservation) {
        throw new NotFoundError('Refund not found');
      }

      const isManager = await Property.exists({
        property_id: reservation.property_id,
        manager_user_id: req.user.user_id,
      });

      if (!isManager) {
        throw new NotFoundError('Refund not found');
      }
    }

    // Idempotent early check: if already PROCESSED, return 200 without reprocessing
    if (refund.status === 'PROCESSED' || refund.status === 'SUCCESS') {
      logger.info(`Idempotent process call on already processed refund ${refund.refund_id}`);
      const reservation = await Reservation.findOne({
        reservation_id: refund.reservation_id,
      }).lean();
      return res.status(200).json({
        message: 'Refund has already been processed',
        refund,
        reservation,
      });
    }

    // Atomic conditional processing inside transaction
    const result = await runInTransaction(async (session) => {
      const queryOpts = session ? { session } : {};

      // Conditional update on refund document: must be in PENDING status
      const updatedRefund = await Refund.findOneAndUpdate(
        {
          refund_id: req.params.id,
          status: 'PENDING',
        },
        {
          $set: {
            status: 'PROCESSED',
            refunded_at: new Date(),
          },
        },
        { new: true, ...queryOpts }
      );

      // If another concurrent request just processed it, handle idempotently
      if (!updatedRefund) {
        const currentRefund = await Refund.findOne(
          { refund_id: req.params.id },
          null,
          queryOpts
        ).lean();

        if (
          currentRefund &&
          (currentRefund.status === 'PROCESSED' || currentRefund.status === 'SUCCESS')
        ) {
          const currentRes = await Reservation.findOne(
            { reservation_id: currentRefund.reservation_id },
            null,
            queryOpts
          ).lean();
          return {
            message: 'Refund processed successfully',
            refund: currentRefund,
            reservation: currentRes,
          };
        }

        throw new ConflictError(
          'Refund cannot be processed: status is no longer PENDING',
          null,
          'REFUND_STATUS_CONFLICT'
        );
      }

      // Transition Reservation from REFUND_PENDING to REFUNDED
      const updatedReservation = await transitionReservation({
        reservationId: refund.reservation_id,
        fromStatus: 'REFUND_PENDING',
        toStatus: 'REFUNDED',
        options: { session },
      });

      // Write Audit Log in same transaction
      const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
      await AuditLog.create(
        [
          {
            audit_id: auditId,
            user_id: req.user.user_id,
            action: 'REFUND_PROCESSED',
            entity_type: 'REFUND',
            entity_id: refund.refund_id,
            metadata: {
              processed_by: req.user.user_id,
              reservation_id: refund.reservation_id,
              refund_amount: refund.refund_amount,
              cancellation_fee: refund.cancellation_fee,
              status: 'PROCESSED',
            },
          },
        ],
        queryOpts
      );

      return {
        message: 'Refund processed successfully',
        refund: updatedRefund,
        reservation: updatedReservation,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

export default {
  listRefunds,
  getRefundById,
  processRefund,
};
