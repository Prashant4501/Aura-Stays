import { Router } from 'express';
import {
  getQuote,
  createReservation,
  listReservations,
  getReservationById,
  checkInReservation,
  checkOutReservation,
  getCancellationPreview,
  cancelReservation,
  quoteSchema,
  createReservationSchema,
  cancelReservationSchema,
} from '../controllers/reservationController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';

const router = Router();

// 1. Quote endpoint (public / optional auth)
router.post('/quote', validateRequest({ body: quoteSchema }), getQuote);

// 2. Reservation creation endpoint (authenticated)
router.post(
  '/',
  authenticate,
  validateRequest({ body: createReservationSchema }),
  createReservation
);

// 3. List reservations (scoped by role)
router.get('/', authenticate, listReservations);

// 4. Cancellation preview (BEFORE confirming cancellation)
router.get('/:id/cancellation-preview', authenticate, getCancellationPreview);

// 5. Cancel reservation
router.post(
  '/:id/cancel',
  authenticate,
  validateRequest({ body: cancelReservationSchema }),
  cancelReservation
);

// 6. Check-in reservation (Admin or property's Property Manager)
router.post('/:id/check-in', authenticate, checkInReservation);

// 7. Check-out reservation (Admin or property's Property Manager)
router.post('/:id/check-out', authenticate, checkOutReservation);

// 8. Get single reservation by ID (ownership enforced, 404 rule)
router.get('/:id', authenticate, getReservationById);

export default router;
