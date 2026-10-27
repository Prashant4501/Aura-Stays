import mongoose from 'mongoose';

const roomPricingSchema = new mongoose.Schema(
  {
    pricing_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    room_type_id: {
      type: String,
      required: true,
      ref: 'RoomType',
      index: true,
    },
    start_date: {
      type: Date,
      required: true,
    },
    end_date: {
      type: Date,
      required: true,
    },
    // Stored as integer in paise (e.g. 300000 paise = 3000.00 INR)
    price_per_night: {
      type: Number,
      required: true,
      min: 0,
    },
    pricing_type: {
      type: String,
      required: true,
      enum: ['BASE', 'SEASONAL', 'WEEKEND', 'HOLIDAY'],
      default: 'BASE',
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

roomPricingSchema.index({ room_type_id: 1, start_date: 1, end_date: 1 });

export const RoomPricing = mongoose.model('RoomPricing', roomPricingSchema);
export default RoomPricing;
