import mongoose from 'mongoose';

const reservationSchema = new mongoose.Schema(
  {
    reservation_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    reservation_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    guest_id: {
      type: String,
      required: true,
      ref: 'Guest',
      index: true,
    },
    property_id: {
      type: String,
      required: true,
      ref: 'Property',
      index: true,
    },
    room_id: {
      type: String,
      required: true,
      ref: 'Room',
      index: true,
    },
    check_in_date: {
      type: Date,
      required: true,
    },
    check_out_date: {
      type: Date,
      required: true,
    },
    guests_count: {
      type: Number,
      required: true,
      min: 1,
    },
    // Financial values in integer paise
    base_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    discount_amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tax_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    service_fee: {
      type: Number,
      required: true,
      min: 0,
    },
    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      required: true,
      enum: [
        'PENDING',
        'CONFIRMED',
        'CHECKED_IN',
        'CHECKED_OUT',
        'CANCELLED',
        'REFUND_PENDING',
        'REFUNDED',
        'EXPIRED',
      ],
      default: 'PENDING',
      index: true,
    },
    hold_expires_at: {
      type: Date,
      default: null,
      index: true,
    },
    cancellation_policy: {
      type: String,
      required: true,
      enum: ['STRICT', 'FLEXIBLE', 'MODERATE'],
      default: 'FLEXIBLE',
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

reservationSchema.index({ room_id: 1, check_in_date: 1, check_out_date: 1 });
reservationSchema.index({ guest_id: 1, status: 1 });

export const Reservation = mongoose.model('Reservation', reservationSchema);
export default Reservation;
