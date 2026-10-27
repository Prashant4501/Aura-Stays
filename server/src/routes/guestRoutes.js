import { Router } from 'express';
import {
  getMyProfile,
  updateMyProfile,
  updateGuestProfileSchema,
} from '../controllers/guestController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';

const router = Router();

// Guest Profile Management routes (GUEST role only)
router.get('/me', authenticate, authorize('GUEST'), getMyProfile);
router.patch(
  '/me',
  authenticate,
  authorize('GUEST'),
  validateRequest({ body: updateGuestProfileSchema }),
  updateMyProfile
);

export default router;
