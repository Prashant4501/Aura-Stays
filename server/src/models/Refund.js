import mongoose from 'mongoose';

const refundSchema = new mongoose.Schema(
  {
    refund_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    refund_reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    // Required unique index on reservation_id (prevents duplicate refund for same reservation)
    reservation_id: {
      type: String,
      required: true,
      unique: true,
      ref: 'Reservation',
      index: true,
    },
    payment_id: {
      type: String,
      required: true,
      ref: 'Payment',
      index: true,
    },
    guest_id: {
      type: String,
      required: true,
      ref: 'Guest',
      index: true,
    },
    // In integer paise
    original_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    cancellation_fee: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    refund_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'PROCESSED', 'PENDING', 'FAILED'],
      default: 'PENDING',
      index: true,
    },
    idempotency_key: {
      type: String,
      trim: true,
    },
    refunded_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Unique index on idempotency_key (sparse so nulls are ignored)
refundSchema.index({ idempotency_key: 1 }, { unique: true, sparse: true });

export const Refund = mongoose.model('Refund', refundSchema);
export default Refund;
