import mongoose from 'mongoose';
import { logger } from './logger.js';

let isReplicaSetCached = null;

/**
 * Checks whether the active MongoDB instance supports multi-document transactions
 * (i.e. running as a replica set or sharded mongos cluster).
 *
 * @returns {Promise<boolean>}
 */
export const checkTransactionSupport = async () => {
  if (isReplicaSetCached !== null) {
    return isReplicaSetCached;
  }

  try {
    const admin = mongoose.connection.db.admin();
    const status = await admin.command({ replSetGetStatus: 1 });
    isReplicaSetCached = !!status.ok;
  } catch {
    // If not running as a replica set, command fails with code 76 / not running with --replSet
    isReplicaSetCached = false;
  }

  logger.debug(`MongoDB multi-document transaction support: ${isReplicaSetCached}`);
  return isReplicaSetCached;
};

/**
 * Executes an operation inside a MongoDB transaction when supported by the cluster,
 * with bounded retries for transient transaction errors.
 *
 * If running on a standalone development instance without replica set, executes
 * the operation directly with compensating cleanup on duplicate key errors.
 *
 * @param {Function} operation - async (session, isTransactional) => result
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {Function} [options.onCompensation] - async (error) => void
 * @returns {Promise<any>}
 */
export const runInTransaction = async (operation, options = {}) => {
  const { maxRetries = 5, onCompensation } = options;
  const hasTxSupport = await checkTransactionSupport();

  if (!hasTxSupport) {
    // Standalone MongoDB: Execute directly with compensation rollback on error
    try {
      return await operation(null, false);
    } catch (err) {
      if (onCompensation) {
        try {
          await onCompensation(err);
        } catch (compErr) {
          logger.warn({ err: compErr }, 'Compensating rollback failed');
        }
      }
      throw err;
    }
  }

  // Replica Set MongoDB: Native multi-document transactions with retry loop
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const result = await operation(session, true);
      await session.commitTransaction();
      return result;
    } catch (err) {
      await session.abortTransaction();

      // Check if transient transaction error
      const isTransient =
        err.hasErrorLabel &&
        (err.hasErrorLabel('TransientTransactionError') ||
          err.hasErrorLabel('UnknownTransactionCommitResult'));

      if (isTransient && attempt < maxRetries) {
        const jitter = Math.floor(Math.random() * 50);
        logger.warn(`Transient transaction error on attempt ${attempt}. Retrying...`);
        await new Promise((resolve) => setTimeout(resolve, 60 * attempt + jitter));
        continue;
      }

      throw err;
    } finally {
      session.endSession();
    }
  }
};

export default { checkTransactionSupport, runInTransaction };
