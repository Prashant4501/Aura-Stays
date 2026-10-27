import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  me,
  registerSchema,
  loginSchema,
} from '../controllers/authController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';
import { authRateLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

// Rate-limited auth routes
router.post('/register', authRateLimiter, validateRequest({ body: registerSchema }), register);
router.post('/login', authRateLimiter, validateRequest({ body: loginSchema }), login);
router.post('/refresh', refresh);
router.post('/logout', logout);

// Authenticated session check
router.get('/me', authenticate, me);

export default router;
