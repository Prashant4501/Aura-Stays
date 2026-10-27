import mongoose from 'mongoose';

/**
 * Business ID generator utility.
 * Generates human-readable string business IDs matching mock data conventions:
 * - USR-001, GST-001, PROP-001, RTYP-001, ROOM-101, PRC-001, RES-001,
 *   CPN-001, RED-001, PAY-001, REF-001, AUD-001, INV-001
 * - GST-00001 (5 digits)
 * - RES-24-0001 (year-coded 4 digits)
 * - TXN-..., RFD-... (transaction and refund references)
 *
 * Uses an atomic Counter collection to guarantee unique sequential IDs
 * even under extreme concurrent requests.
 */

// Atomic Counter Schema
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

/**
 * Formats a prefix and integer sequence into a business ID string.
 * @param {string} prefix - e.g. "USR-", "PROP-", "RES-"
 * @param {number} seq - e.g. 1
 * @param {number} padding - e.g. 3 -> "001"
 * @returns {string} e.g. "USR-001"
 */
export const formatBusinessId = (prefix, seq, padding = 3) => {
  return `${prefix}${String(seq).padStart(padding, '0')}`;
};

/**
 * Atomically generates the next sequential business ID for a Mongoose model.
 * Initializes sequence from existing collection data if counter doesn't exist yet,
 * then atomically increments to guarantee concurrency safety.
 *
 * @param {import('mongoose').Model} model - Mongoose model
 * @param {string} idField - Field name (e.g. 'user_id', 'property_id', 'reservation_id')
 * @param {string} prefix - Prefix string including separator (e.g. 'USR-', 'PROP-', 'RES-')
 * @param {number} padding - Number of leading zero digits (default: 3)
 * @returns {Promise<string>} Next unique business ID (e.g. "RES-007")
 */
export const getNextBusinessId = async (model, idField, prefix, padding = 3) => {
  const counterKey = `${model.modelName}_${idField}_${prefix}`;
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escapedPrefix}(\\d+)$`);

  // Ensure counter is initialized to highest current ID
  const existingCounter = await Counter.findById(counterKey).lean();

  if (!existingCounter) {
    const docs = await model.find({ [idField]: { $regex: regex } }, { [idField]: 1 }).lean();
    let maxNum = 0;
    for (const doc of docs) {
      const val = doc[idField];
      if (typeof val === 'string') {
        const match = val.match(regex);
        if (match && match[1]) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }

    await Counter.findByIdAndUpdate(
      counterKey,
      { $setOnInsert: { seq: maxNum } },
      { upsert: true, new: true }
    );
  }

  // Atomically increment counter
  const updated = await Counter.findByIdAndUpdate(
    counterKey,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  return formatBusinessId(prefix, updated.seq, padding);
};

/**
 * Generates reservation number in format RES-YY-0001 atomically.
 * e.g., RES-24-0001, RES-26-0001
 *
 * @param {import('mongoose').Model} reservationModel
 * @param {Date|number} [dateOrYear]
 * @returns {Promise<string>}
 */
export const getNextReservationNumber = async (reservationModel, dateOrYear = new Date()) => {
  const yearStr = (dateOrYear instanceof Date ? dateOrYear.getFullYear() : Number(dateOrYear))
    .toString()
    .slice(-2);
  const prefix = `RES-${yearStr}-`;

  return getNextBusinessId(reservationModel, 'reservation_number', prefix, 4);
};

/**
 * Generates guest number in format GST-00001 atomically.
 *
 * @param {import('mongoose').Model} guestModel
 * @returns {Promise<string>}
 */
export const getNextGuestNumber = async (guestModel) => {
  return getNextBusinessId(guestModel, 'guest_number', 'GST-', 5);
};

/**
 * Generates payment transaction reference in format TXN-xxxxxxxxxx
 * @returns {string}
 */
export const generatePaymentReference = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `TXN-${timestamp}${random}`;
};

/**
 * Generates refund reference in format RFD-xxxxxxxxxx
 * @returns {string}
 */
export const generateRefundReference = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RFD-${timestamp}${random}`;
};
