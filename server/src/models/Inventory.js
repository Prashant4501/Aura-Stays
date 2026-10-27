import mongoose from 'mongoose';

const inventorySchema = new mongoose.Schema(
  {
    inventory_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    room_id: {
      type: String,
      required: true,
      ref: 'Room',
      index: true,
    },
    // Normalized to UTC midnight (e.g. 2024-09-20T00:00:00.000Z)
    date: {
      type: Date,
      required: true,
      index: true,
    },
    reservation_id: {
      type: String,
      required: false,
      ref: 'Reservation',
      default: null,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['BOOKED', 'BLOCKED', 'MAINTENANCE', 'HOLD'],
      default: 'BOOKED',
    },
    reason: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

// UNIQUE compound index on { room_id, date } prevents double-booking at the database level
inventorySchema.index({ room_id: 1, date: 1 }, { unique: true });

export const Inventory = mongoose.model('Inventory', inventorySchema);
export default Inventory;
