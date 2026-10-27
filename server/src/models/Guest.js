import mongoose from 'mongoose';

const guestSchema = new mongoose.Schema(
  {
    guest_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    user_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
      ref: 'User',
    },
    guest_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
      default: '',
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

export const Guest = mongoose.model('Guest', guestSchema);
export default Guest;
