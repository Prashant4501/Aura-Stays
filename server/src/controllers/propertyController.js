import { Property, RoomType } from '../models/index.js';
import { NotFoundError } from '../errors/AppError.js';

/**
 * GET /api/v1/properties
 * Public list of all active properties.
 */
export const listProperties = async (req, res, next) => {
  try {
    const filter = { status: 'ACTIVE' };

    if (req.query.city) {
      filter.city = new RegExp(`^${req.query.city.trim()}$`, 'i');
    }
    if (req.query.property_type) {
      filter.property_type = req.query.property_type.trim().toUpperCase();
    }
    if (req.query.state) {
      filter.state = new RegExp(`^${req.query.state.trim()}$`, 'i');
    }

    const properties = await Property.find(filter).sort({ name: 1 }).lean();

    return res.status(200).json({
      count: properties.length,
      properties,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/v1/properties/:id
 * Public property details by business property_id. Returns 404 if not found or inactive.
 */
export const getPropertyById = async (req, res, next) => {
  try {
    const property = await Property.findOne({
      property_id: req.params.id,
      status: 'ACTIVE',
    }).lean();

    if (!property) {
      throw new NotFoundError('Property not found');
    }

    // Attach active room types for this property
    const roomTypes = await RoomType.find({
      property_id: property.property_id,
      status: 'ACTIVE',
    }).lean();

    return res.status(200).json({
      property,
      room_types: roomTypes,
    });
  } catch (error) {
    next(error);
  }
};

export default { listProperties, getPropertyById };
