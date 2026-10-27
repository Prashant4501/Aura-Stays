import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    payment_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    payment_reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    reservation_id: {
      type: String,
      required: true,
      ref: 'Reservation',
      index: true,
    },
    guest_id: {
      type: String,
      required: true,
      ref: 'Guest',
      index: true,
    },
    // Stored as integer paise (e.g. 1730000 = ₹17300.00)
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    payment_method: {
      type: String,
      required: true,
      enum: ['CARD', 'UPI', 'NET_BANKING', 'WALLET', 'CASH'],
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'PENDING', 'FAILED', 'REFUNDED'],
      default: 'PENDING',
      index: true,
    },
    idempotency_key: {
      type: String,
      required: true,
      trim: true,
    },
    paid_at: {
      type: Date,
      default: null,
    },
    // Stored response for idempotent replay
    response_status: {
      type: Number,
      default: 200,
    },
    response_body: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Required unique index on idempotency_key scoped with user/guest
paymentSchema.index({ idempotency_key: 1, guest_id: 1 }, { unique: true });

export const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
