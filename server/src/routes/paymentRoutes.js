import { Router } from 'express';
import {
  processPayment,
  listPayments,
  getPaymentById,
  createPaymentSchema,
} from '../controllers/paymentController.js';
import { authenticate } from '../middlewares/auth.js';
import { validateRequest } from '../middlewares/validate.js';

const router = Router();

// All payment routes require authentication
router.use(authenticate);

router.post('/', validateRequest({ body: createPaymentSchema }), processPayment);
router.get('/', listPayments);
router.get('/:id', getPaymentById);

export default router;
