import { z } from 'zod';
import { Guest, User } from '../models/index.js';
import { NotFoundError } from '../errors/AppError.js';

// Schema for updating guest profile
export const updateGuestProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  phone: z.string().trim().min(7, 'Phone number must be at least 7 characters').optional(),
  address: z.string().trim().optional(),
});

/**
 * GET /api/v1/guests/me
 * Retrieves current authenticated guest's profile.
 */
export const getMyProfile = async (req, res, next) => {
  try {
    const guest = await Guest.findOne({ user_id: req.user.user_id }).lean();
    if (!guest) {
      throw new NotFoundError('Guest profile not found');
    }

    return res.status(200).json({ guest });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/guests/me
 * Updates current authenticated guest's profile details.
 * Ignores any foreign keys or immutable fields (guest_id, user_id, guest_number, email).
 */
export const updateMyProfile = async (req, res, next) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.address !== undefined) updates.address = req.body.address;

    const guest = await Guest.findOneAndUpdate(
      { user_id: req.user.user_id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!guest) {
      throw new NotFoundError('Guest profile not found');
    }

    // Keep User display name in sync if name updated
    if (updates.name) {
      await User.updateOne({ user_id: req.user.user_id }, { $set: { name: updates.name } });
    }

    return res.status(200).json({
      message: 'Profile updated successfully',
      guest,
    });
  } catch (error) {
    next(error);
  }
};

export default { getMyProfile, updateMyProfile };
