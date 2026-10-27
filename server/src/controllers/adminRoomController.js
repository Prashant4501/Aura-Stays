import { z } from 'zod';
import { Room, RoomType, RoomPricing, Inventory, Reservation, AuditLog } from '../models/index.js';
import { getNextBusinessId } from '../utils/idGenerator.js';
import { assertCanManageProperty, getManagedPropertyIds } from '../middlewares/roleScope.js';
import { NotFoundError, ConflictError, BadRequestError } from '../errors/AppError.js';
import { normalizeToUtcMidnight, generateNightsList, hasDateRangeOverlap } from '../utils/dates.js';

// ==========================================
// Zod Schemas
// ==========================================

export const createRoomTypeSchema = z
  .object({
    property_id: z.string().trim().min(1, 'Property ID is required'),
    name: z.string().trim().min(1, 'Room type name is required'),
    description: z.string().trim().optional().default(''),
    max_guests: z.number().int().min(1, 'max_guests must be at least 1'),
    base_price_per_night: z
      .number()
      .int()
      .min(0, 'base_price_per_night must be at least 0 (in paise)'),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .strict();

export const updateRoomTypeSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    max_guests: z.number().int().min(1).optional(),
    base_price_per_night: z.number().int().min(0).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

export const createRoomSchema = z
  .object({
    property_id: z.string().trim().min(1, 'Property ID is required'),
    room_type_id: z.string().trim().min(1, 'Room type ID is required'),
    room_number: z.string().trim().min(1, 'Room number is required'),
    floor: z.number().int().default(1),
    max_guests: z.number().int().min(1).optional(),
    status: z.enum(['AVAILABLE', 'ACTIVE', 'INACTIVE', 'MAINTENANCE']).default('ACTIVE'),
  })
  .strict();

export const updateRoomSchema = z
  .object({
    room_number: z.string().trim().min(1).optional(),
    floor: z.number().int().optional(),
    max_guests: z.number().int().min(1).optional(),
    status: z
      .enum(['AVAILABLE', 'ACTIVE', 'INACTIVE', 'MAINTENANCE', 'OCCUPIED', 'RESERVED'])
      .optional(),
    room_type_id: z.string().trim().min(1).optional(),
  })
  .strict();

export const blockDatesSchema = z
  .object({
    start_date: z.string().trim().min(1, 'start_date is required'),
    end_date: z.string().trim().min(1, 'end_date is required'),
    reason: z.string().trim().optional().default('BLOCKED'),
  })
  .strict();

export const unblockDatesSchema = z
  .object({
    start_date: z.string().trim().min(1, 'start_date is required'),
    end_date: z.string().trim().min(1, 'end_date is required'),
  })
  .strict();

export const createRoomPricingSchema = z
  .object({
    room_type_id: z.string().trim().min(1, 'Room type ID is required'),
    start_date: z.string().trim().min(1, 'start_date is required'),
    end_date: z.string().trim().min(1, 'end_date is required'),
    price_per_night: z.number().int().min(0, 'price_per_night must be at least 0 (in paise)'),
    pricing_type: z.enum(['BASE', 'SEASONAL', 'WEEKEND', 'HOLIDAY']).default('SEASONAL'),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  })
  .strict();

export const updateRoomPricingSchema = z
  .object({
    start_date: z.string().trim().min(1).optional(),
    end_date: z.string().trim().min(1).optional(),
    price_per_night: z.number().int().min(0).optional(),
    pricing_type: z.enum(['BASE', 'SEASONAL', 'WEEKEND', 'HOLIDAY']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  })
  .strict();

// ==========================================
// Room Type Controllers
// ==========================================

export const createRoomType = async (req, res, next) => {
  try {
    const { property_id, name, description, max_guests, base_price_per_night, status } = req.body;
    await assertCanManageProperty(property_id, req.user);

    const roomTypeId = await getNextBusinessId(RoomType, 'room_type_id', 'RTYP-', 3);

    const roomType = await RoomType.create({
      room_type_id: roomTypeId,
      property_id,
      name,
      description,
      max_guests,
      base_price_per_night,
      status,
    });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_TYPE_CREATED',
      entity_type: 'ROOM_TYPE',
      entity_id: roomTypeId,
      metadata: { property_id, name, base_price_per_night },
    });

    return res.status(201).json({
      message: 'Room type created successfully',
      room_type: roomType,
    });
  } catch (error) {
    next(error);
  }
};

export const listRoomTypes = async (req, res, next) => {
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

    const roomTypes = await RoomType.find(filter).sort({ created_at: -1 }).lean();

    return res.status(200).json({
      count: roomTypes.length,
      room_types: roomTypes,
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomTypeById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const roomType = await RoomType.findOne({ room_type_id: id }).lean();
    if (!roomType) {
      throw new NotFoundError('Room type not found');
    }

    await assertCanManageProperty(roomType.property_id, req.user);

    return res.status(200).json({ room_type: roomType });
  } catch (error) {
    next(error);
  }
};

export const updateRoomType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await RoomType.findOne({ room_type_id: id });
    if (!existing) {
      throw new NotFoundError('Room type not found');
    }

    await assertCanManageProperty(existing.property_id, req.user);

    const updated = await RoomType.findOneAndUpdate(
      { room_type_id: id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_TYPE_UPDATED',
      entity_type: 'ROOM_TYPE',
      entity_id: id,
      metadata: { property_id: existing.property_id, updated_fields: Object.keys(req.body) },
    });

    return res.status(200).json({
      message: 'Room type updated successfully',
      room_type: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRoomType = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await RoomType.findOne({ room_type_id: id });
    if (!existing) {
      throw new NotFoundError('Room type not found');
    }

    await assertCanManageProperty(existing.property_id, req.user);

    const roomsCount = await Room.countDocuments({ room_type_id: id });
    if (roomsCount > 0) {
      throw new ConflictError(
        'Cannot delete room type: rooms are currently assigned to this room type. Set status to INACTIVE instead.',
        null,
        'ROOM_TYPE_IN_USE'
      );
    }

    await RoomType.findOneAndDelete({ room_type_id: id });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_TYPE_DELETED',
      entity_type: 'ROOM_TYPE',
      entity_id: id,
      metadata: { property_id: existing.property_id, name: existing.name },
    });

    return res.status(200).json({
      message: 'Room type deleted successfully',
      room_type_id: id,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Room Controllers
// ==========================================

export const createRoom = async (req, res, next) => {
  try {
    const { property_id, room_type_id, room_number, floor, max_guests, status } = req.body;
    await assertCanManageProperty(property_id, req.user);

    const roomType = await RoomType.findOne({ room_type_id, property_id });
    if (!roomType) {
      throw new NotFoundError('Room type not found for this property');
    }

    const duplicateRoom = await Room.findOne({ property_id, room_number });
    if (duplicateRoom) {
      throw new ConflictError(
        `Room number ${room_number} already exists in this property`,
        null,
        'ROOM_NUMBER_CONFLICT'
      );
    }

    const roomId = await getNextBusinessId(Room, 'room_id', 'ROOM-', 3);

    const room = await Room.create({
      room_id: roomId,
      property_id,
      room_type_id,
      room_number,
      floor,
      max_guests: max_guests || roomType.max_guests,
      status,
    });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_CREATED',
      entity_type: 'ROOM',
      entity_id: roomId,
      metadata: { property_id, room_number, room_type_id },
    });

    return res.status(201).json({
      message: 'Room created successfully',
      room,
    });
  } catch (error) {
    next(error);
  }
};

export const listRooms = async (req, res, next) => {
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

    if (req.query.room_type_id) {
      filter.room_type_id = req.query.room_type_id;
    }

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [rooms, total] = await Promise.all([
      Room.find(filter).sort({ room_number: 1 }).skip(skip).limit(limit).lean(),
      Room.countDocuments(filter),
    ]);

    return res.status(200).json({
      rooms,
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

export const getRoomById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const room = await Room.findOne({ room_id: id }).lean();
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    await assertCanManageProperty(room.property_id, req.user);

    return res.status(200).json({ room });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/admin/rooms/:id
 * RULE: Deactivating a room (INACTIVE/MAINTENANCE) must NOT break existing confirmed reservations.
 * Existing reservations remain intact.
 */
export const updateRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Room.findOne({ room_id: id });
    if (!existing) {
      throw new NotFoundError('Room not found');
    }

    await assertCanManageProperty(existing.property_id, req.user);

    // If changing room_number, ensure unique within property
    if (req.body.room_number && req.body.room_number !== existing.room_number) {
      const duplicate = await Room.findOne({
        property_id: existing.property_id,
        room_number: req.body.room_number,
      });
      if (duplicate) {
        throw new ConflictError(
          `Room number ${req.body.room_number} already exists in this property`,
          null,
          'ROOM_NUMBER_CONFLICT'
        );
      }
    }

    const updated = await Room.findOneAndUpdate(
      { room_id: id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_UPDATED',
      entity_type: 'ROOM',
      entity_id: id,
      metadata: {
        property_id: existing.property_id,
        updated_fields: Object.keys(req.body),
        new_status: req.body.status || existing.status,
      },
    });

    return res.status(200).json({
      message: 'Room updated successfully',
      room: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRoom = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Room.findOne({ room_id: id });
    if (!existing) {
      throw new NotFoundError('Room not found');
    }

    await assertCanManageProperty(existing.property_id, req.user);

    const activeReservationsCount = await Reservation.countDocuments({
      room_id: id,
      status: { $in: ['CONFIRMED', 'PENDING', 'CHECKED_IN'] },
    });

    if (activeReservationsCount > 0) {
      throw new ConflictError(
        'Cannot delete room: active or confirmed reservations exist for this room. Deactivate it instead.',
        null,
        'ROOM_HAS_ACTIVE_RESERVATIONS'
      );
    }

    await Room.findOneAndDelete({ room_id: id });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_DELETED',
      entity_type: 'ROOM',
      entity_id: id,
      metadata: { property_id: existing.property_id, room_number: existing.room_number },
    });

    return res.status(200).json({
      message: 'Room deleted successfully',
      room_id: id,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Room Availability Management (Block / Unblock)
// ==========================================

/**
 * POST /api/v1/admin/rooms/:id/block
 * Blocks dates for a room by creating inventory documents with status and reason 'BLOCKED'.
 * Refuses to block nights that have an existing reservation.
 */
export const blockRoomDates = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_date, end_date, reason } = req.body;

    const room = await Room.findOne({ room_id: id });
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    await assertCanManageProperty(room.property_id, req.user);

    const startUtc = normalizeToUtcMidnight(start_date);
    const endUtc = normalizeToUtcMidnight(end_date);

    if (endUtc.getTime() <= startUtc.getTime()) {
      throw new BadRequestError(
        'end_date must be strictly after start_date',
        null,
        'INVALID_DATE_RANGE'
      );
    }

    const nights = generateNightsList(startUtc, endUtc);

    // Check if any night has an existing reservation
    const existingInventory = await Inventory.find({
      room_id: id,
      date: { $in: nights },
    }).lean();

    const conflictingReservation = existingInventory.find(
      (inv) => inv.reservation_id !== null || inv.status === 'BOOKED' || inv.status === 'HOLD'
    );

    if (conflictingReservation) {
      throw new ConflictError(
        'Cannot block room: existing reservations found for selected dates',
        null,
        'ROOM_HAS_RESERVATION'
      );
    }

    let newlyBlockedCount = 0;
    for (const night of nights) {
      const existing = existingInventory.find((inv) => inv.date.getTime() === night.getTime());
      if (existing) {
        if (existing.status !== 'BLOCKED' || existing.reason !== (reason || 'BLOCKED')) {
          await Inventory.updateOne(
            { _id: existing._id },
            { $set: { status: 'BLOCKED', reason: reason || 'BLOCKED' } }
          );
        }
      } else {
        const invId = await getNextBusinessId(Inventory, 'inventory_id', 'INV-', 4);
        await Inventory.create({
          inventory_id: invId,
          room_id: id,
          date: night,
          reservation_id: null,
          status: 'BLOCKED',
          reason: reason || 'BLOCKED',
        });
        newlyBlockedCount++;
      }
    }

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_DATES_BLOCKED',
      entity_type: 'ROOM',
      entity_id: id,
      metadata: {
        property_id: room.property_id,
        room_number: room.room_number,
        start_date: startUtc.toISOString(),
        end_date: endUtc.toISOString(),
        nights_count: nights.length,
        reason: reason || 'BLOCKED',
      },
    });

    return res.status(200).json({
      message: 'Room dates blocked successfully',
      room_id: id,
      blocked_nights: nights.length,
      newly_blocked_count: newlyBlockedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/v1/admin/rooms/:id/unblock
 * Unblocks dates for a room by deleting inventory documents with status 'BLOCKED'.
 */
export const unblockRoomDates = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.body;

    const room = await Room.findOne({ room_id: id });
    if (!room) {
      throw new NotFoundError('Room not found');
    }

    await assertCanManageProperty(room.property_id, req.user);

    const startUtc = normalizeToUtcMidnight(start_date);
    const endUtc = normalizeToUtcMidnight(end_date);

    if (endUtc.getTime() <= startUtc.getTime()) {
      throw new BadRequestError(
        'end_date must be strictly after start_date',
        null,
        'INVALID_DATE_RANGE'
      );
    }

    const nights = generateNightsList(startUtc, endUtc);

    const deleteResult = await Inventory.deleteMany({
      room_id: id,
      date: { $in: nights },
      status: 'BLOCKED',
    });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_DATES_UNBLOCKED',
      entity_type: 'ROOM',
      entity_id: id,
      metadata: {
        property_id: room.property_id,
        room_number: room.room_number,
        start_date: startUtc.toISOString(),
        end_date: endUtc.toISOString(),
        unblocked_count: deleteResult.deletedCount,
      },
    });

    return res.status(200).json({
      message: 'Room dates unblocked successfully',
      room_id: id,
      unblocked_count: deleteResult.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

// ==========================================
// Room Pricing Controllers (Seasonal Periods)
// ==========================================

export const createRoomPricing = async (req, res, next) => {
  try {
    const { room_type_id, start_date, end_date, price_per_night, pricing_type, status } = req.body;

    const roomType = await RoomType.findOne({ room_type_id });
    if (!roomType) {
      throw new NotFoundError('Room type not found');
    }

    await assertCanManageProperty(roomType.property_id, req.user);

    const startUtc = normalizeToUtcMidnight(start_date);
    const endUtc = normalizeToUtcMidnight(end_date);

    if (endUtc.getTime() <= startUtc.getTime()) {
      throw new BadRequestError(
        'end_date must be strictly after start_date',
        null,
        'INVALID_DATE_RANGE'
      );
    }

    // Overlap validation: reject overlapping periods for the same room type
    if (status === 'ACTIVE') {
      const activePricings = await RoomPricing.find({
        room_type_id,
        status: 'ACTIVE',
      }).lean();

      for (const p of activePricings) {
        if (hasDateRangeOverlap(startUtc, endUtc, p.start_date, p.end_date)) {
          throw new ConflictError(
            `Pricing period overlaps with existing period (${new Date(p.start_date).toISOString().split('T')[0]} to ${new Date(p.end_date).toISOString().split('T')[0]}) for this room type`,
            null,
            'SEASONAL_PRICING_OVERLAP'
          );
        }
      }
    }

    const pricingId = await getNextBusinessId(RoomPricing, 'pricing_id', 'PRC-', 3);

    const pricing = await RoomPricing.create({
      pricing_id: pricingId,
      room_type_id,
      start_date: startUtc,
      end_date: endUtc,
      price_per_night,
      pricing_type,
      status,
    });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_PRICING_CREATED',
      entity_type: 'ROOM_PRICING',
      entity_id: pricingId,
      metadata: {
        property_id: roomType.property_id,
        room_type_id,
        start_date: startUtc.toISOString(),
        end_date: endUtc.toISOString(),
        price_per_night,
      },
    });

    return res.status(201).json({
      message: 'Room pricing period created successfully',
      pricing,
    });
  } catch (error) {
    next(error);
  }
};

export const listRoomPricing = async (req, res, next) => {
  try {
    const filter = {};
    const managedPropIds = await getManagedPropertyIds(req.user);

    if (managedPropIds !== null) {
      // Find room types in managed properties
      const managedRoomTypes = await RoomType.find(
        { property_id: { $in: managedPropIds } },
        { room_type_id: 1 }
      ).lean();
      const managedRoomTypeIds = managedRoomTypes.map((rt) => rt.room_type_id);
      filter.room_type_id = { $in: managedRoomTypeIds };
    }

    if (req.query.room_type_id) {
      if (
        filter.room_type_id &&
        filter.room_type_id.$in &&
        !filter.room_type_id.$in.includes(req.query.room_type_id)
      ) {
        throw new NotFoundError('Room type not found');
      }
      filter.room_type_id = req.query.room_type_id;
    }

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }

    const pricings = await RoomPricing.find(filter).sort({ start_date: 1 }).lean();

    return res.status(200).json({
      count: pricings.length,
      pricings,
    });
  } catch (error) {
    next(error);
  }
};

export const getRoomPricingById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pricing = await RoomPricing.findOne({ pricing_id: id }).lean();
    if (!pricing) {
      throw new NotFoundError('Room pricing not found');
    }

    const roomType = await RoomType.findOne({ room_type_id: pricing.room_type_id });
    if (!roomType) {
      throw new NotFoundError('Room type not found');
    }

    await assertCanManageProperty(roomType.property_id, req.user);

    return res.status(200).json({ pricing });
  } catch (error) {
    next(error);
  }
};

export const updateRoomPricing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await RoomPricing.findOne({ pricing_id: id });
    if (!existing) {
      throw new NotFoundError('Room pricing not found');
    }

    const roomType = await RoomType.findOne({ room_type_id: existing.room_type_id });
    if (!roomType) {
      throw new NotFoundError('Room type not found');
    }

    await assertCanManageProperty(roomType.property_id, req.user);

    const newStart = req.body.start_date
      ? normalizeToUtcMidnight(req.body.start_date)
      : existing.start_date;
    const newEnd = req.body.end_date
      ? normalizeToUtcMidnight(req.body.end_date)
      : existing.end_date;
    const newStatus = req.body.status || existing.status;

    if (newEnd.getTime() <= newStart.getTime()) {
      throw new BadRequestError(
        'end_date must be strictly after start_date',
        null,
        'INVALID_DATE_RANGE'
      );
    }

    // Overlap validation if active
    if (newStatus === 'ACTIVE') {
      const otherActive = await RoomPricing.find({
        room_type_id: existing.room_type_id,
        pricing_id: { $ne: id },
        status: 'ACTIVE',
      }).lean();

      for (const p of otherActive) {
        if (hasDateRangeOverlap(newStart, newEnd, p.start_date, p.end_date)) {
          throw new ConflictError(
            `Pricing period overlaps with existing period (${new Date(p.start_date).toISOString().split('T')[0]} to ${new Date(p.end_date).toISOString().split('T')[0]}) for this room type`,
            null,
            'SEASONAL_PRICING_OVERLAP'
          );
        }
      }
    }

    const updateData = { ...req.body };
    if (req.body.start_date) updateData.start_date = newStart;
    if (req.body.end_date) updateData.end_date = newEnd;

    const updated = await RoomPricing.findOneAndUpdate(
      { pricing_id: id },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_PRICING_UPDATED',
      entity_type: 'ROOM_PRICING',
      entity_id: id,
      metadata: {
        property_id: roomType.property_id,
        room_type_id: existing.room_type_id,
        updated_fields: Object.keys(req.body),
      },
    });

    return res.status(200).json({
      message: 'Room pricing updated successfully',
      pricing: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteRoomPricing = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await RoomPricing.findOne({ pricing_id: id });
    if (!existing) {
      throw new NotFoundError('Room pricing not found');
    }

    const roomType = await RoomType.findOne({ room_type_id: existing.room_type_id });
    if (roomType) {
      await assertCanManageProperty(roomType.property_id, req.user);
    }

    await RoomPricing.findOneAndDelete({ pricing_id: id });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'ROOM_PRICING_DELETED',
      entity_type: 'ROOM_PRICING',
      entity_id: id,
      metadata: { pricing_id: id },
    });

    return res.status(200).json({
      message: 'Room pricing deleted successfully',
      pricing_id: id,
    });
  } catch (error) {
    next(error);
  }
};

export default {
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
};
