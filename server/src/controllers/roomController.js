import { z } from 'zod';
import { Room, RoomType, Property, Inventory, RoomPricing } from '../models/index.js';
import { validateDateRange, generateNightsList, getUtcToday } from '../utils/dates.js';
import { expireStaleReservations } from '../services/expirationService.js';
import { calculateReservationQuote } from '../services/pricingService.js';
import { NotFoundError } from '../errors/AppError.js';

// Query validation schema for room search
export const roomSearchSchema = z.object({
  property_id: z.string().trim().optional(),
  check_in: z.string().trim().min(1, 'check_in date is required'),
  check_out: z.string().trim().min(1, 'check_out date is required'),
  guests: z.coerce.number().int().min(1).optional().default(1),
});

/**
 * GET /api/v1/rooms/search?property_id&check_in&check_out&guests
 * Returns only rooms that:
 * 1. Are AVAILABLE (active)
 * 2. Belong to an ACTIVE property
 * 3. Have capacity for requested guests
 * 4. Have NO inventory documents for any night in the [check_in, check_out) range
 */
export const searchAvailableRooms = async (req, res, next) => {
  try {
    const { property_id, check_in, check_out, guests } = req.query;

    // Run lazy expiration sweep to release any expired holds
    await expireStaleReservations();

    // 1. Validate check-in / check-out dates
    const { checkInUtc, checkOutUtc, nights } = validateDateRange(check_in, check_out);
    const nightsList = generateNightsList(checkInUtc, checkOutUtc);

    // 2. Identify ACTIVE properties
    const activeProperties = await Property.find(
      { status: 'ACTIVE' },
      { property_id: 1, name: 1, city: 1 }
    ).lean();
    const activePropertyIds = activeProperties.map((p) => p.property_id);

    // If property_id specified, check if active
    if (property_id && !activePropertyIds.includes(property_id)) {
      return res.status(200).json({
        search_criteria: { property_id, check_in, check_out, nights, guests },
        available_rooms_count: 0,
        available_rooms: [],
      });
    }

    const targetPropertyIds = property_id ? [property_id] : activePropertyIds;

    // 3. Find all rooms with inventory documents for ANY night in the range
    const bookedInventory = await Inventory.find(
      { date: { $in: nightsList } },
      { room_id: 1 }
    ).lean();
    const bookedRoomIds = [...new Set(bookedInventory.map((i) => i.room_id))];

    // 4. Query rooms matching availability criteria
    const roomFilter = {
      property_id: { $in: targetPropertyIds },
      status: { $in: ['AVAILABLE', 'ACTIVE'] },
      max_guests: { $gte: Number(guests) },
      room_id: { $nin: bookedRoomIds },
    };

    const rooms = await Room.find(roomFilter)
      .sort({ property_id: 1, floor: 1, room_number: 1 })
      .lean();

    // 5. Enrich rooms with RoomType details and live quote breakdown
    const roomTypeIds = [...new Set(rooms.map((r) => r.room_type_id))];
    const roomTypes = await RoomType.find({ room_type_id: { $in: roomTypeIds } }).lean();
    const roomTypeMap = new Map(roomTypes.map((rt) => [rt.room_type_id, rt]));

    const pricingRules = await RoomPricing.find({
      room_type_id: { $in: roomTypeIds },
      status: 'ACTIVE',
    }).lean();

    const propertyMap = new Map(activeProperties.map((p) => [p.property_id, p]));

    const availableRooms = rooms.map((room) => {
      const rt = roomTypeMap.get(room.room_type_id);
      const prop = propertyMap.get(room.property_id);
      const rules = pricingRules.filter((r) => r.room_type_id === room.room_type_id);

      let quote = null;
      if (rt) {
        quote = calculateReservationQuote({
          roomType: rt,
          pricingRules: rules,
          checkInDate: checkInUtc,
          checkOutDate: checkOutUtc,
          guestsCount: Number(guests),
          context: { propertyId: room.property_id },
        });
      }

      return {
        ...room,
        property_name: prop?.name || '',
        city: prop?.city || '',
        room_type: rt || null,
        pricing_quote: quote,
      };
    });

    return res.status(200).json({
      search_criteria: {
        property_id: property_id || null,
        check_in: checkInUtc.toISOString().split('T')[0],
        check_out: checkOutUtc.toISOString().split('T')[0],
        nights,
        guests: Number(guests),
      },
      available_rooms_count: availableRooms.length,
      available_rooms: availableRooms,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/rooms/:id
 * Public room details including property, room type, and active booked dates.
 */
export const getRoomById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // Run lazy expiration to clean expired holds
    await expireStaleReservations();

    const room = await Room.findOne({ room_id: id }).lean();
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    const todayUtc = getUtcToday();
    const [property, roomType, activeInventory] = await Promise.all([
      Property.findOne({ property_id: room.property_id }).lean(),
      RoomType.findOne({ room_type_id: room.room_type_id }).lean(),
      Inventory.find({
        room_id: room.room_id,
        date: { $gte: todayUtc },
      }).lean(),
    ]);

    const bookedDates = activeInventory.map(
      (inv) => inv.date.toISOString().split('T')[0]
    );

    return res.status(200).json({
      room: {
        ...room,
        room_type: roomType,
      },
      property,
      booked_dates: bookedDates,
    });
  } catch (error) {
    next(error);
  }
};

export default { searchAvailableRooms, getRoomById };
