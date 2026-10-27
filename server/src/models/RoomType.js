import mongoose from 'mongoose';

const roomTypeSchema = new mongoose.Schema(
  {
    room_type_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    property_id: {
      type: String,
      required: true,
      ref: 'Property',
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    max_guests: {
      type: Number,
      required: true,
      min: 1,
    },
    // Stored as integer in paise (e.g. 300000 paise = 3000.00 INR)
    base_price_per_night: {
      type: Number,
      required: true,
      min: 0,
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

roomTypeSchema.index({ property_id: 1, name: 1 });

export const RoomType = mongoose.model('RoomType', roomTypeSchema);
export default RoomType;
