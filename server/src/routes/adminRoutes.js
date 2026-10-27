import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createProperty,
  updateProperty,
  deleteProperty,
  listAdminProperties,
  getAdminPropertyById,
  createPropertySchema,
  updatePropertySchema,
} from '../controllers/adminPropertyController.js';
import {
  createRoomType,
  listRoomTypes,
  getRoomTypeById,
  updateRoomType,
  deleteRoomType,
  createRoom,
  listRooms,
  getRoomById,
  updateRoom,
  deleteRoom,
  blockRoomDates,
  unblockRoomDates,
  createRoomPricing,
  listRoomPricing,
  getRoomPricingById,
  updateRoomPricing,
  deleteRoomPricing,
  createRoomTypeSchema,
  updateRoomTypeSchema,
  createRoomSchema,
  updateRoomSchema,
  blockDatesSchema,
  unblockDatesSchema,
  createRoomPricingSchema,
  updateRoomPricingSchema,
} from '../controllers/adminRoomController.js';
import {
  createCoupon,
  listCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
  createCouponSchema,
  updateCouponSchema,
} from '../controllers/adminCouponController.js';
import {
  listAdminReservations,
  getAdminReservationById,
} from '../controllers/adminReservationController.js';
import {
  getOccupancyReport,
  getRevenueReport,
  getBookingsReport,
  getCouponsReport,
  getKpiReport,
} from '../controllers/adminReportController.js';
import { listAuditLogs } from '../controllers/adminAuditLogController.js';

const router = Router();

// Protect all admin/manager routes: authentication and role authorization
router.use(authenticate, authorize('ADMIN', 'PROPERTY_MANAGER'));

// ==========================================
// Properties CRUD
// ==========================================
router.post('/properties', authorize('ADMIN'), validate(createPropertySchema), createProperty);
router.get('/properties', listAdminProperties);
router.get('/properties/:id', getAdminPropertyById);
router.patch('/properties/:id', validate(updatePropertySchema), updateProperty);
router.delete('/properties/:id', authorize('ADMIN'), deleteProperty);

// ==========================================
// Room Types CRUD
// ==========================================
router.post('/room-types', validate(createRoomTypeSchema), createRoomType);
router.get('/room-types', listRoomTypes);
router.get('/room-types/:id', getRoomTypeById);
router.patch('/room-types/:id', validate(updateRoomTypeSchema), updateRoomType);
router.delete('/room-types/:id', deleteRoomType);

// ==========================================
// Rooms CRUD & Availability Management
// ==========================================
router.post('/rooms', validate(createRoomSchema), createRoom);
router.get('/rooms', listRooms);
router.get('/rooms/:id', getRoomById);
router.patch('/rooms/:id', validate(updateRoomSchema), updateRoom);
router.delete('/rooms/:id', deleteRoom);
router.post('/rooms/:id/block', validate(blockDatesSchema), blockRoomDates);
router.post('/rooms/:id/unblock', validate(unblockDatesSchema), unblockRoomDates);

// ==========================================
// Room Pricing (Seasonal Periods) CRUD
// ==========================================
router.post('/room-pricing', validate(createRoomPricingSchema), createRoomPricing);
router.get('/room-pricing', listRoomPricing);
router.get('/room-pricing/:id', getRoomPricingById);
router.patch('/room-pricing/:id', validate(updateRoomPricingSchema), updateRoomPricing);
router.delete('/room-pricing/:id', deleteRoomPricing);

// ==========================================
// Coupons CRUD
// ==========================================
router.post('/coupons', validate(createCouponSchema), createCoupon);
router.get('/coupons', listCoupons);
router.get('/coupons/:id', getCouponById);
router.patch('/coupons/:id', validate(updateCouponSchema), updateCoupon);
router.delete('/coupons/:id', deleteCoupon);

// ==========================================
// Reservations Listing
// ==========================================
router.get('/reservations', listAdminReservations);
router.get('/reservations/:id', getAdminReservationById);

// ==========================================
// Reports (Aggregation Pipelines)
// ==========================================
router.get('/reports/occupancy', getOccupancyReport);
router.get('/reports/revenue', getRevenueReport);
router.get('/reports/bookings', getBookingsReport);
router.get('/reports/coupons', getCouponsReport);
router.get('/reports/kpi', getKpiReport);

// ==========================================
// Audit Logs
// ==========================================
router.get('/audit-logs', listAuditLogs);

export default router;
