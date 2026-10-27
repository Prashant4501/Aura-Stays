import { AuditLog, Room, Reservation } from '../models/index.js';
import { getManagedPropertyIds } from '../middlewares/roleScope.js';
import { normalizeToUtcMidnight } from '../utils/dates.js';

/**
 * GET /api/v1/admin/audit-logs
 * List audit logs with filters and pagination.
 * ADMIN sees all; PROPERTY_MANAGER sees only logs for their properties.
 */
export const listAuditLogs = async (req, res, next) => {
  try {
    const filter = {};
    const managedPropIds = await getManagedPropertyIds(req.user);

    if (managedPropIds !== null) {
      // Find all rooms and reservations belonging to managed properties
      const [managedRooms, managedReservations] = await Promise.all([
        Room.find({ property_id: { $in: managedPropIds } }, { room_id: 1 }).lean(),
        Reservation.find({ property_id: { $in: managedPropIds } }, { reservation_id: 1 }).lean(),
      ]);

      const managedRoomIds = managedRooms.map((r) => r.room_id);
      const managedReservationIds = managedReservations.map((r) => r.reservation_id);

      filter.$or = [
        { entity_type: 'PROPERTY', entity_id: { $in: managedPropIds } },
        { entity_type: 'ROOM', entity_id: { $in: managedRoomIds } },
        { entity_type: 'RESERVATION', entity_id: { $in: managedReservationIds } },
        { 'metadata.property_id': { $in: managedPropIds } },
        { 'metadata.reservation_id': { $in: managedReservationIds } },
      ];
    }

    if (req.query.action) {
      filter.action = req.query.action.toUpperCase();
    }

    if (req.query.entity_type) {
      filter.entity_type = req.query.entity_type.toUpperCase();
    }

    if (req.query.user_id) {
      filter.user_id = req.query.user_id;
    }

    if (req.query.start_date || req.query.end_date) {
      filter.created_at = {};
      if (req.query.start_date) {
        filter.created_at.$gte = normalizeToUtcMidnight(req.query.start_date);
      }
      if (req.query.end_date) {
        filter.created_at.$lte = new Date(
          normalizeToUtcMidnight(req.query.end_date).getTime() + 86400000
        );
      }
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      audit_logs: logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listAuditLogs,
};
