import { Reservation, Guest, Room, Property } from '../models/index.js';
import { assertCanManageProperty, getManagedPropertyIds } from '../middlewares/roleScope.js';
import { NotFoundError } from '../errors/AppError.js';
import { normalizeToUtcMidnight } from '../utils/dates.js';

/**
 * GET /api/v1/admin/reservations
 * List reservations with filters:
 * - status
 * - property_id
 * - check_in_from & check_in_to
 * - search by reservation_number, guest name, or guest email
 * - pagination (page, limit)
 *
 * Scoping:
 * - ADMIN: unrestricted
 * - PROPERTY_MANAGER: restricted to managed properties
 */
export const listAdminReservations = async (req, res, next) => {
  try {
    const filter = {};
    const managedPropIds = await getManagedPropertyIds(req.user);

    if (managedPropIds !== null) {
      filter.property_id = { $in: managedPropIds };
    }

    if (req.query.property_id) {
      if (managedPropIds !== null && !managedPropIds.includes(req.query.property_id)) {
        throw new NotFoundError('Property not found');
      }
      filter.property_id = req.query.property_id;
    }

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }

    if (req.query.check_in_from || req.query.check_in_to) {
      filter.check_in_date = {};
      if (req.query.check_in_from) {
        filter.check_in_date.$gte = normalizeToUtcMidnight(req.query.check_in_from);
      }
      if (req.query.check_in_to) {
        filter.check_in_date.$lte = normalizeToUtcMidnight(req.query.check_in_to);
      }
    }

    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search.trim(), 'i');

      // Find guests matching search by name or email
      const matchingGuests = await Guest.find(
        {
          $or: [{ first_name: searchRegex }, { last_name: searchRegex }, { email: searchRegex }],
        },
        { guest_id: 1 }
      ).lean();
      const matchingGuestIds = matchingGuests.map((g) => g.guest_id);

      filter.$or = [
        { reservation_number: searchRegex },
        { reservation_id: searchRegex },
        { guest_id: { $in: matchingGuestIds } },
      ];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [reservations, total] = await Promise.all([
      Reservation.find(filter).sort({ created_at: -1 }).skip(skip).limit(limit).lean(),
      Reservation.countDocuments(filter),
    ]);

    // Enrich reservations with guest info
    const guestIds = [...new Set(reservations.map((r) => r.guest_id))];
    const propertyIds = [...new Set(reservations.map((r) => r.property_id))];
    const roomIds = [...new Set(reservations.map((r) => r.room_id))];

    const [guests, properties, rooms] = await Promise.all([
      Guest.find({ guest_id: { $in: guestIds } }).lean(),
      Property.find({ property_id: { $in: propertyIds } }).lean(),
      Room.find({ room_id: { $in: roomIds } }).lean(),
    ]);

    const guestMap = new Map(guests.map((g) => [g.guest_id, g]));
    const propertyMap = new Map(properties.map((p) => [p.property_id, p]));
    const roomMap = new Map(rooms.map((r) => [r.room_id, r]));

    const enriched = reservations.map((resv) => {
      const guest = guestMap.get(resv.guest_id);
      const property = propertyMap.get(resv.property_id);
      const room = roomMap.get(resv.room_id);

      return {
        ...resv,
        guest: guest
          ? {
              guest_id: guest.guest_id,
              first_name: guest.first_name,
              last_name: guest.last_name,
              email: guest.email,
              phone: guest.phone,
            }
          : null,
        property_name: property ? property.name : null,
        room_number: room ? room.room_number : null,
      };
    });

    return res.status(200).json({
      reservations: enriched,
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

/**
 * GET /api/v1/admin/reservations/:id
 * Single reservation details with authorization check.
 */
export const getAdminReservationById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reservation = await Reservation.findOne({
      $or: [{ reservation_id: id }, { reservation_number: id }],
    }).lean();

    if (!reservation) {
      throw new NotFoundError('Reservation not found');
    }

    await assertCanManageProperty(reservation.property_id, req.user);

    const [guest, property, room] = await Promise.all([
      Guest.findOne({ guest_id: reservation.guest_id }).lean(),
      Property.findOne({ property_id: reservation.property_id }).lean(),
      Room.findOne({ room_id: reservation.room_id }).lean(),
    ]);

    return res.status(200).json({
      reservation: {
        ...reservation,
        guest: guest
          ? {
              guest_id: guest.guest_id,
              first_name: guest.first_name,
              last_name: guest.last_name,
              email: guest.email,
              phone: guest.phone,
            }
          : null,
        property_name: property ? property.name : null,
        room_number: room ? room.room_number : null,
      },
    });
  } catch (error) {
    next(error);
  }
};

export default {
  listAdminReservations,
  getAdminReservationById,
};
