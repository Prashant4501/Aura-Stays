import { Reservation, Inventory, AuditLog, Coupon, CouponRedemption } from '../models/index.js';
import { getNextBusinessId } from '../utils/idGenerator.js';
import { logger } from '../utils/logger.js';

let intervalHandle = null;

/**
 * Sweeps the database for PENDING reservations whose hold_expires_at timestamp has passed.
 * Sets reservation status to EXPIRED and removes their corresponding inventory hold documents,
 * immediately freeing up the rooms for other guests.
 * Reverts any applied coupon redemptions and decrements coupon used_count.
 *
 * @returns {Promise<number>} Count of expired reservations processed
 */
export const expireStaleReservations = async () => {
  try {
    const now = new Date();
    const staleReservations = await Reservation.find({
      status: 'PENDING',
      hold_expires_at: { $lte: now },
    });

    if (staleReservations.length === 0) {
      return 0;
    }

    logger.info(`Found ${staleReservations.length} expired pending reservation(s). Cleaning up...`);

    let count = 0;
    for (const res of staleReservations) {
      // 1. Mark status as EXPIRED
      res.status = 'EXPIRED';
      await res.save();

      // 2. Delete inventory documents to release room dates
      const delResult = await Inventory.deleteMany({ reservation_id: res.reservation_id });

      // 3. Revert any associated coupon redemptions and release coupon hold
      const redemptions = await CouponRedemption.find({
        reservation_id: res.reservation_id,
        status: { $in: ['PENDING', 'SUCCESS'] },
      });
      for (const red of redemptions) {
        await Coupon.updateOne(
          { coupon_id: red.coupon_id, used_count: { $gt: 0 } },
          { $inc: { used_count: -1 } }
        );
        red.status = 'REVERTED';
        await red.save();
      }

      // 4. Write audit log
      try {
        const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
        await AuditLog.create({
          audit_id: auditId,
          user_id: 'SYSTEM',
          action: 'RESERVATION_EXPIRED',
          entity_type: 'RESERVATION',
          entity_id: res.reservation_id,
          metadata: {
            reason: 'Hold expiration (15m window elapsed without confirmation)',
            released_nights: delResult.deletedCount,
            expired_at: now.toISOString(),
          },
        });
      } catch (auditErr) {
        logger.warn({ err: auditErr }, 'Failed to record expiration audit log');
      }

      count++;
      logger.info(
        `Expired reservation ${res.reservation_id} and released ${delResult.deletedCount} inventory document(s)`
      );
    }

    return count;
  } catch (error) {
    logger.error({ err: error }, 'Error during stale reservation expiration sweep');
    return 0;
  }
};

/**
 * Starts the periodic background expiration job.
 * @param {number} [intervalMs=60000] - Frequency in milliseconds (default 60s)
 */
export const startExpirationJob = (intervalMs = 60000) => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
  }

  logger.info(`Starting background reservation expiration job (interval: ${intervalMs}ms)`);
  // Run initial sweep
  expireStaleReservations().catch((err) => logger.error({ err }, 'Initial sweep failed'));

  intervalHandle = setInterval(() => {
    expireStaleReservations().catch((err) => logger.error({ err }, 'Periodic sweep failed'));
  }, intervalMs);

  return intervalHandle;
};

/**
 * Stops the periodic background expiration job.
 */
export const stopExpirationJob = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('Stopped background reservation expiration job');
  }
};

export default {
  expireStaleReservations,
  startExpirationJob,
  stopExpirationJob,
};
