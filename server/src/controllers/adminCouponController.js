import { z } from 'zod';
import { Coupon, AuditLog } from '../models/index.js';
import { getNextBusinessId } from '../utils/idGenerator.js';
import { assertCanManageProperty, getManagedPropertyIds } from '../middlewares/roleScope.js';
import {
  NotFoundError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
} from '../errors/AppError.js';
import { normalizeToUtcMidnight } from '../utils/dates.js';

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2, 'Coupon code must be at least 2 characters')
      .transform((val) => val.toUpperCase()),
    discount_type: z.enum(['PERCENTAGE', 'FIXED']),
    discount_value: z.number().int().min(1, 'discount_value must be at least 1'),
    maximum_discount: z.number().int().min(0, 'maximum_discount must be at least 0 (in paise)'),
    minimum_booking_amount: z
      .number()
      .int()
      .min(0, 'minimum_booking_amount must be at least 0 (in paise)')
      .default(0),
    usage_limit: z.number().int().min(1, 'usage_limit must be at least 1'),
    per_customer_limit: z.number().int().min(1, 'per_customer_limit must be at least 1').default(1),
    valid_from: z.string().trim().min(1, 'valid_from date is required'),
    valid_until: z.string().trim().min(1, 'valid_until date is required'),
    applicable_property_id: z.string().trim().optional().nullable(),
    applicable_room_type_id: z.string().trim().optional().nullable(),
    restricted_guest_id: z.string().trim().optional().nullable(),
    status: z.enum(['ACTIVE', 'EXPIRED', 'DISABLED']).default('ACTIVE'),
  })
  .strict();

export const updateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(2)
      .transform((val) => val.toUpperCase())
      .optional(),
    discount_type: z.enum(['PERCENTAGE', 'FIXED']).optional(),
    discount_value: z.number().int().min(1).optional(),
    maximum_discount: z.number().int().min(0).optional(),
    minimum_booking_amount: z.number().int().min(0).optional(),
    usage_limit: z.number().int().min(1).optional(),
    per_customer_limit: z.number().int().min(1).optional(),
    valid_from: z.string().trim().optional(),
    valid_until: z.string().trim().optional(),
    applicable_property_id: z.string().trim().optional().nullable(),
    applicable_room_type_id: z.string().trim().optional().nullable(),
    restricted_guest_id: z.string().trim().optional().nullable(),
    status: z.enum(['ACTIVE', 'EXPIRED', 'DISABLED']).optional(),
  })
  .strict();

export const createCoupon = async (req, res, next) => {
  try {
    const data = { ...req.body };

    // Manager scoping check
    if (req.user.role === 'PROPERTY_MANAGER') {
      if (!data.applicable_property_id) {
        throw new ForbiddenError(
          'Property managers must specify an applicable_property_id for properties they manage'
        );
      }
      await assertCanManageProperty(data.applicable_property_id, req.user);
    } else if (data.applicable_property_id) {
      await assertCanManageProperty(data.applicable_property_id, req.user);
    }

    const validFromUtc = normalizeToUtcMidnight(data.valid_from);
    const validUntilUtc = normalizeToUtcMidnight(data.valid_until);

    if (validUntilUtc.getTime() <= validFromUtc.getTime()) {
      throw new BadRequestError(
        'valid_until must be strictly after valid_from',
        null,
        'INVALID_DATE_RANGE'
      );
    }

    // Check unique code
    const existing = await Coupon.findOne({ code: data.code.toUpperCase() });
    if (existing) {
      throw new ConflictError(
        `Coupon with code ${data.code} already exists`,
        null,
        'COUPON_CODE_CONFLICT'
      );
    }

    const couponId = await getNextBusinessId(Coupon, 'coupon_id', 'CPN-', 3);

    const coupon = await Coupon.create({
      coupon_id: couponId,
      ...data,
      code: data.code.toUpperCase(),
      valid_from: validFromUtc,
      valid_until: validUntilUtc,
    });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'COUPON_CREATED',
      entity_type: 'COUPON',
      entity_id: couponId,
      metadata: {
        code: coupon.code,
        applicable_property_id: coupon.applicable_property_id,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
      },
    });

    return res.status(201).json({
      message: 'Coupon created successfully',
      coupon,
    });
  } catch (error) {
    next(error);
  }
};

export const listCoupons = async (req, res, next) => {
  try {
    const filter = {};
    const managedPropIds = await getManagedPropertyIds(req.user);

    if (managedPropIds !== null) {
      filter.applicable_property_id = { $in: managedPropIds };
    }

    if (req.query.property_id) {
      if (managedPropIds !== null && !managedPropIds.includes(req.query.property_id)) {
        throw new NotFoundError('Property not found');
      }
      filter.applicable_property_id = req.query.property_id;
    }

    if (req.query.status) {
      filter.status = req.query.status.toUpperCase();
    }

    const coupons = await Coupon.find(filter).sort({ created_at: -1 }).lean();

    return res.status(200).json({
      count: coupons.length,
      coupons,
    });
  } catch (error) {
    next(error);
  }
};

export const getCouponById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findOne({ coupon_id: id }).lean();
    if (!coupon) {
      throw new NotFoundError('Coupon not found');
    }

    if (req.user.role === 'PROPERTY_MANAGER') {
      if (!coupon.applicable_property_id) {
        throw new NotFoundError('Coupon not found');
      }
      await assertCanManageProperty(coupon.applicable_property_id, req.user);
    }

    return res.status(200).json({ coupon });
  } catch (error) {
    next(error);
  }
};

export const updateCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Coupon.findOne({ coupon_id: id });
    if (!existing) {
      throw new NotFoundError('Coupon not found');
    }

    if (req.user.role === 'PROPERTY_MANAGER') {
      if (!existing.applicable_property_id) {
        throw new NotFoundError('Coupon not found');
      }
      await assertCanManageProperty(existing.applicable_property_id, req.user);

      if (req.body.applicable_property_id) {
        await assertCanManageProperty(req.body.applicable_property_id, req.user);
      }
    }

    const updateData = { ...req.body };
    if (req.body.code) {
      updateData.code = req.body.code.toUpperCase();
      const duplicate = await Coupon.findOne({
        code: updateData.code,
        coupon_id: { $ne: id },
      });
      if (duplicate) {
        throw new ConflictError(
          `Coupon with code ${updateData.code} already exists`,
          null,
          'COUPON_CODE_CONFLICT'
        );
      }
    }

    if (req.body.valid_from) {
      updateData.valid_from = normalizeToUtcMidnight(req.body.valid_from);
    }
    if (req.body.valid_until) {
      updateData.valid_until = normalizeToUtcMidnight(req.body.valid_until);
    }

    const validFrom = updateData.valid_from || existing.valid_from;
    const validUntil = updateData.valid_until || existing.valid_until;
    if (new Date(validUntil).getTime() <= new Date(validFrom).getTime()) {
      throw new BadRequestError(
        'valid_until must be strictly after valid_from',
        null,
        'INVALID_DATE_RANGE'
      );
    }

    const updated = await Coupon.findOneAndUpdate(
      { coupon_id: id },
      { $set: updateData },
      { new: true, runValidators: true }
    );

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'COUPON_UPDATED',
      entity_type: 'COUPON',
      entity_id: id,
      metadata: {
        code: updated.code,
        applicable_property_id: updated.applicable_property_id,
        updated_fields: Object.keys(req.body),
      },
    });

    return res.status(200).json({
      message: 'Coupon updated successfully',
      coupon: updated,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteCoupon = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await Coupon.findOne({ coupon_id: id });
    if (!existing) {
      throw new NotFoundError('Coupon not found');
    }

    if (req.user.role === 'PROPERTY_MANAGER') {
      if (!existing.applicable_property_id) {
        throw new NotFoundError('Coupon not found');
      }
      await assertCanManageProperty(existing.applicable_property_id, req.user);
    }

    await Coupon.findOneAndDelete({ coupon_id: id });

    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: req.user.user_id,
      action: 'COUPON_DELETED',
      entity_type: 'COUPON',
      entity_id: id,
      metadata: { code: existing.code },
    });

    return res.status(200).json({
      message: 'Coupon deleted successfully',
      coupon_id: id,
    });
  } catch (error) {
    next(error);
  }
};

export default {
  createCoupon,
  listCoupons,
  getCouponById,
  updateCoupon,
  deleteCoupon,
};
