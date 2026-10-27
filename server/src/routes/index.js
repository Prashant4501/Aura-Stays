import { Router } from 'express';
import authRoutes from './authRoutes.js';
import guestRoutes from './guestRoutes.js';
import propertyRoutes from './propertyRoutes.js';
import roomRoutes from './roomRoutes.js';
import reservationRoutes from './reservationRoutes.js';
import paymentRoutes from './paymentRoutes.js';
import refundRoutes from './refundRoutes.js';
import adminRoutes from './adminRoutes.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { listAuditLogs } from '../controllers/adminAuditLogController.js';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/guests', guestRoutes);
apiRouter.use('/properties', propertyRoutes);
apiRouter.use('/rooms', roomRoutes);
apiRouter.use('/reservations', reservationRoutes);
apiRouter.use('/payments', paymentRoutes);
apiRouter.use('/refunds', refundRoutes);

// Protected Admin Overview endpoint for role authorization testing
apiRouter.get('/admin/overview', authenticate, authorize('ADMIN'), (req, res) => {
  res.status(200).json({ message: 'Welcome Admin', user: req.user });
});

// Audit Logs direct alias route (ADMIN & PROPERTY_MANAGER only)
apiRouter.get('/audit-logs', authenticate, authorize('ADMIN', 'PROPERTY_MANAGER'), listAuditLogs);

// Admin and Property Manager Management API
apiRouter.use('/admin', adminRoutes);

export default apiRouter;
