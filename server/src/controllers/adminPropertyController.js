import { z } from 'zod';
import { Property, AuditLog } from '../models/index.js';
import { getNextBusinessId } from '../utils/idGenerator.js';
import { assertCanManageProperty } from '../middlewares/roleScope.js';
import { NotFoundError, ForbiddenError } from '../errors/AppError.js';

export const createPropertySchema = z
  .object({
    name: z.string().trim().min(1, 'Property name is required'),
    description: z.string().trim().optional(),
    property_type: z.enum(['HOTEL', 'RESORT', 'VILLA', 'APARTMENT']).default('HOTEL'),
    address: z.string().trim().min(1, 'Address is required'),
    city: z.string().trim().min(1, 'City is required'),
    state: z.string().trim().optional(),
    country: z.string().trim().default('India'),
    manager_user_id: z.string().trim().min(1, 'Manager user ID is required'),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
    amenities: z.array(z.string()).optional().default([]),
  })
  .strict();

export const updatePropertySchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().trim().optional(),
    property_type: z.enum(['HOTEL', 'RESORT', 'VILLA', 'APARTMENT']).optional(),
    address: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),
    manager_user_id: z.string().trim().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    amenities: z.array(z.string()).optional(),
  })
  .strict();

/**
 * POST /api/v1/admin/properties
 * Creates a new property. Restricted to ADMIN only.
 */
export const createProperty = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only administrators can create properties');
    }

    const propertyId = await getNextBusinessId(Property, 'property_id', 'PROP-', 3);

    const property = await Property.create({
      property_id: propertyId,
      ...req.body,
    });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'PROPERTY_CREATED',
      entity_type: 'PROPERTY',
      entity_id: propertyId,
      metadata: { name: property.name, manager_user_id: property.manager_user_id },
    });

    return res.status(201).json({
      message: 'Property created successfully',
      property,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/v1/admin/properties/:id
 * Updates property details. ADMIN or assigned PROPERTY_MANAGER.
 */
export const updateProperty = async (req, res, next) => {
  try {
    const { id } = req.params;
    await assertCanManageProperty(id, req.user);

    // Only ADMIN can reassign manager_user_id
    if (req.body.manager_user_id && req.user.role !== 'ADMIN') {
      delete req.body.manager_user_id;
    }

    const updated = await Property.findOneAndUpdate(
      { property_id: id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw new NotFoundError('Property not found');
    }

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'PROPERTY_UPDATED',
      entity_type: 'PROPERTY',
      entity_id: id,
      metadata: { updated_fields: Object.keys(req.body) },
    });

    return res.status(200).json({
      message: 'Property updated successfully',
      property: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/v1/admin/properties/:id
 * Deletes property. ADMIN only.
 */
export const deleteProperty = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenError('Only administrators can delete properties');
    }

    const { id } = req.params;
    const deleted = await Property.findOneAndDelete({ property_id: id });
    if (!deleted) {
      throw new NotFoundError('Property not found');
    }

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'PROPERTY_DELETED',
      entity_type: 'PROPERTY',
      entity_id: id,
      metadata: { name: deleted.name },
    });

    return res.status(200).json({
      message: 'Property deleted successfully',
      property_id: id,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/properties
 * Lists properties. Admin sees all; manager sees only their properties.
 */
export const listAdminProperties = async (req, res, next) => {
  try {
    const filter = {};
    if (req.user.role === 'PROPERTY_MANAGER') {
      filter.manager_user_id = req.user.user_id;
    }

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }
    if (req.query.city) {
      filter.city = { $regex: req.query.city, $options: 'i' };
    }

    const properties = await Property.find(filter).sort({ created_at: -1 }).lean();

    return res.status(200).json({
      count: properties.length,
      properties,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/admin/properties/:id
 * Gets single property with scoping.
 */
export const getAdminPropertyById = async (req, res, next) => {
  try {
    const { id } = req.params;
    await assertCanManageProperty(id, req.user);

    const property = await Property.findOne({ property_id: id }).lean();
    if (!property) {
      throw new NotFoundError('Property not found');
    }

    return res.status(200).json({ property });
  } catch (error) {
    next(error);
  }
};

export default {
  createProperty,
  updateProperty,
  deleteProperty,
  listAdminProperties,
  getAdminPropertyById,
};
