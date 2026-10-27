import mongoose from 'mongoose';

const propertySchema = new mongoose.Schema(
  {
    property_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    property_code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    property_type: {
      type: String,
      required: true,
      enum: ['HOTEL', 'RESORT', 'VILLA', 'APARTMENT'],
      default: 'HOTEL',
      index: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      default: 'India',
    },
    status: {
      type: String,
      required: true,
      enum: ['ACTIVE', 'INACTIVE', 'MAINTENANCE'],
      default: 'ACTIVE',
      index: true,
    },
    manager_user_id: {
      type: String,
      required: true,
      ref: 'User',
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

export const Property = mongoose.model('Property', propertySchema);
export default Property;
