import { Router } from 'express';
import { listRefunds, getRefundById, processRefund } from '../controllers/refundController.js';
import { authenticate } from '../middlewares/auth.js';

const router = Router();

// All refund routes require authentication
router.use(authenticate);

// 1. List refunds (scoped by role: Guest own, Manager managed, Admin all)
router.get('/', listRefunds);

// 2. Get single refund by ID (ownership enforced, 404 rule)
router.get('/:id', getRefundById);

// 3. Process refund (Admin or Property Manager only)
router.post('/:id/process', processRefund);

export default router;
