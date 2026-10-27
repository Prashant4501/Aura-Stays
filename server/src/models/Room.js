import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema(
  {
    room_id: {
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
    room_type_id: {
      type: String,
      required: true,
      ref: 'RoomType',
      index: true,
    },
    room_number: {
      type: String,
      required: true,
      trim: true,
    },
    floor: {
      type: Number,
      required: true,
      default: 1,
    },
    max_guests: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      required: true,
      enum: ['AVAILABLE', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OCCUPIED', 'RESERVED'],
      default: 'ACTIVE',
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

roomSchema.index({ property_id: 1, room_number: 1 }, { unique: true });

export const Room = mongoose.model('Room', roomSchema);
export default Room;
