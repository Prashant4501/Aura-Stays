import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema(
  {
    coupon_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    discount_type: {
      type: String,
      required: true,
      enum: ['PERCENTAGE', 'FIXED'],
      index: true,
    },
    // For PERCENTAGE: the rate (e.g., 20 = 20%). For FIXED: integer paise (e.g., 150000 = ₹1500.00)
    discount_value: {
      type: Number,
      required: true,
      min: 0,
    },
    // In integer paise
    maximum_discount: {
      type: Number,
      required: true,
      min: 0,
    },
    // In integer paise
    minimum_booking_amount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    usage_limit: {
      type: Number,
      required: true,
      min: 1,
    },
    used_count: {
      type: Number,
      default: 0,
      min: 0,
    },
    per_customer_limit: {
      type: Number,
      default: 1,
      min: 1,
    },
    valid_from: {
      type: Date,
      required: true,
    },
    valid_until: {
      type: Date,
      required: true,
    },
    applicable_property_id: {
      type: String,
      default: null,
      ref: 'Property',
      index: true,
    },
    applicable_room_type_id: {
      type: String,
      default: null,
      ref: 'RoomType',
      index: true,
    },
    restricted_guest_id: {
      type: String,
      default: null,
      ref: 'Guest',
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'EXPIRED', 'DISABLED'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

export const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
