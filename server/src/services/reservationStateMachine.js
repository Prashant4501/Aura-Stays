import { Reservation } from '../models/index.js';
import { ConflictError } from '../errors/AppError.js';

/**
 * Reservation State Machine Transition Map.
 *
 * PENDING         -> CONFIRMED | CANCELLED | EXPIRED
 * CONFIRMED       -> CHECKED_IN | CANCELLED
 * CHECKED_IN      -> CHECKED_OUT
 * CANCELLED       -> REFUND_PENDING (only if a successful payment exists)
 * REFUND_PENDING  -> REFUNDED
 *
 * Everything else returns 409 Conflict.
 */
export const RESERVATION_TRANSITIONS = Object.freeze({
  PENDING: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED'],
  CHECKED_IN: ['CHECKED_OUT'],
  CANCELLED: ['REFUND_PENDING'],
  REFUND_PENDING: ['REFUNDED'],
  EXPIRED: [],
  CHECKED_OUT: [],
  REFUNDED: [],
});

/**
 * Validates whether a state transition is legal according to the transition map and business rules.
 *
 * @param {string} fromStatus
 * @param {string} toStatus
 * @param {Object} [context={}]
 * @param {boolean} [context.hasSuccessfulPayment=false]
 * @returns {boolean}
 */
export const isValidTransition = (fromStatus, toStatus, context = {}) => {
  if (!fromStatus || !toStatus) {
    return false;
  }

  const allowedNext = RESERVATION_TRANSITIONS[fromStatus] || [];
  if (!allowedNext.includes(toStatus)) {
    return false;
  }

  // CANCELLED -> REFUND_PENDING only if a successful payment exists
  if (fromStatus === 'CANCELLED' && toStatus === 'REFUND_PENDING') {
    if (!context.hasSuccessfulPayment) {
      return false;
    }
  }

  return true;
};

/**
 * Executes an atomic conditional state transition on a reservation.
 *
 * Guarantees:
 * - Uses conditional update: findOneAndUpdate with { reservation_id, status: fromStatus }
 * - Any invalid or stale transition immediately throws 409 Conflict.
 *
 * @param {Object} params
 * @param {string} params.reservationId
 * @param {string} params.fromStatus
 * @param {string} params.toStatus
 * @param {boolean} [params.hasSuccessfulPayment=false]
 * @param {Object} [params.extraUpdates={}]
 * @param {Object} [params.options={}] - e.g. { session }
 * @returns {Promise<import('../models/Reservation.js').Reservation>}
 */
export const transitionReservation = async ({
  reservationId,
  fromStatus,
  toStatus,
  hasSuccessfulPayment = false,
  extraUpdates = {},
  options = {},
}) => {
  if (!isValidTransition(fromStatus, toStatus, { hasSuccessfulPayment })) {
    throw new ConflictError(
      `Cannot transition reservation ${reservationId} from ${fromStatus} to ${toStatus}: transition not permitted`,
      null,
      'INVALID_STATE_TRANSITION'
    );
  }

  const queryOpts = options.session ? { session: options.session } : {};

  // Atomic conditional update ensuring concurrency safety
  const updatedReservation = await Reservation.findOneAndUpdate(
    {
      reservation_id: reservationId,
      status: fromStatus,
    },
    {
      $set: {
        status: toStatus,
        ...extraUpdates,
      },
    },
    { new: true, ...queryOpts }
  );

  if (!updatedReservation) {
    throw new ConflictError(
      `Failed to transition reservation ${reservationId} to ${toStatus}: current status is no longer ${fromStatus}`,
      null,
      'STATE_TRANSITION_CONFLICT'
    );
  }

  return updatedReservation;
};

/**
 * Computes cancellation policy refund breakdown based on check_in_date.
 *
 * Tier policy:
 * - 48 hours or more before check-in = 100% refund (0% cancellation fee)
 * - 24 to 48 hours before check-in  = 50% refund  (50% cancellation fee)
 * - Under 24 hours before check-in   = 0% refund   (100% cancellation fee)
 *
 * @param {Date|string} checkInDate
 * @param {number} originalAmount - Stored payment amount in paise
 * @param {Date|string} [now=new Date()]
 * @returns {{ hoursUntilCheckIn: number, tier: string, refundPercentage: number, originalAmount: number, cancellationFee: number, refundAmount: number }}
 */
export const calculateCancellationRefund = (checkInDate, originalAmount = 0, now = new Date()) => {
  const checkInTime = new Date(checkInDate).getTime();
  const currentTime = new Date(now).getTime();
  const diffHours = (checkInTime - currentTime) / (1000 * 60 * 60);

  let refundPercentage = 0;
  let tier = 'NO_REFUND';

  if (diffHours >= 48) {
    refundPercentage = 100;
    tier = 'FULL_REFUND';
  } else if (diffHours >= 24) {
    refundPercentage = 50;
    tier = 'PARTIAL_REFUND';
  } else {
    refundPercentage = 0;
    tier = 'NO_REFUND';
  }

  const safeOriginalAmount = Math.max(0, Math.round(originalAmount));
  const refundAmount = Math.round((safeOriginalAmount * refundPercentage) / 100);
  const cancellationFee = safeOriginalAmount - refundAmount;

  return {
    hoursUntilCheckIn: Number(diffHours.toFixed(2)),
    tier,
    refundPercentage,
    originalAmount: safeOriginalAmount,
    cancellationFee,
    refundAmount,
  };
};

export default {
  RESERVATION_TRANSITIONS,
  isValidTransition,
  transitionReservation,
  calculateCancellationRefund,
};
