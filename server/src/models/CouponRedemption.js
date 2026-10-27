import mongoose from 'mongoose';

const couponRedemptionSchema = new mongoose.Schema(
  {
    redemption_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    coupon_id: {
      type: String,
      required: true,
      ref: 'Coupon',
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
    // Stored as integer paise (e.g. 150000 = ₹1500.00)
    discount_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    redeemed_at: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'USED', 'PENDING', 'FAILED', 'REVERTED'],
      default: 'PENDING',
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// Required unique index on { coupon_id, guest_id, reservation_id }
couponRedemptionSchema.index({ coupon_id: 1, guest_id: 1, reservation_id: 1 }, { unique: true });

export const CouponRedemption = mongoose.model('CouponRedemption', couponRedemptionSchema);
export default CouponRedemption;
