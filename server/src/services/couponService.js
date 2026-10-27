import { Coupon, CouponRedemption } from '../models/index.js';
import { BadRequestError, ConflictError } from '../errors/AppError.js';
import { getNextBusinessId } from '../utils/idGenerator.js';

/**
 * Validates a coupon code against all server-side business rules:
 * 1. Coupon existence
 * 2. Status is ACTIVE
 * 3. Date validity: valid_from <= now <= valid_until
 * 4. Property restriction: applicable_property_id
 * 5. Customer restriction: restricted_guest_id
 * 6. Minimum booking amount: minimum_booking_amount <= baseAmount
 * 7. Usage limit: used_count < usage_limit
 * 8. Per-customer limit: customer redemptions < per_customer_limit
 *
 * @param {string} code - Coupon code string
 * @param {number} baseAmount - Base amount in paise
 * @param {Object} [context={}]
 * @param {string} [context.propertyId]
 * @param {string} [context.guestId]
 * @param {Date} [context.now]
 * @param {Object} [options] - e.g. { session }
 * @returns {Promise<{ coupon: Object, discountAmount: number }>}
 */
export const validateCoupon = async (code, baseAmount, context = {}, options = {}) => {
  if (!code || typeof code !== 'string') {
    throw new BadRequestError('Coupon code is required', null, 'INVALID_COUPON');
  }

  const queryOpts = options.session ? { session: options.session } : {};
  const normalizedCode = code.trim().toUpperCase();

  // 1. Coupon existence
  const coupon = await Coupon.findOne({ code: normalizedCode }, null, queryOpts).lean();
  if (!coupon) {
    throw new BadRequestError(
      `Coupon code '${normalizedCode}' does not exist`,
      null,
      'COUPON_NOT_FOUND'
    );
  }

  // 2. Status is ACTIVE
  if (coupon.status !== 'ACTIVE') {
    throw new BadRequestError(
      `Coupon '${normalizedCode}' is ${coupon.status.toLowerCase()}`,
      null,
      'COUPON_INACTIVE'
    );
  }

  // 3. Time validity
  const now = context.now || new Date();
  if (
    now.getTime() < new Date(coupon.valid_from).getTime() ||
    now.getTime() > new Date(coupon.valid_until).getTime()
  ) {
    throw new BadRequestError(
      `Coupon '${normalizedCode}' has expired or is not yet valid`,
      null,
      'COUPON_EXPIRED'
    );
  }

  // 4. Property-specific restriction
  if (
    coupon.applicable_property_id &&
    context.propertyId &&
    coupon.applicable_property_id !== context.propertyId
  ) {
    throw new BadRequestError(
      `Coupon '${normalizedCode}' is only valid for property ${coupon.applicable_property_id}`,
      null,
      'COUPON_PROPERTY_INELIGIBLE'
    );
  }

  // 5. Customer-restricted coupon
  if (
    coupon.restricted_guest_id &&
    context.guestId &&
    coupon.restricted_guest_id !== context.guestId
  ) {
    throw new BadRequestError(
      `Coupon '${normalizedCode}' is restricted to another customer`,
      null,
      'COUPON_CUSTOMER_RESTRICTED'
    );
  }

  // 6. Minimum booking amount
  if (coupon.minimum_booking_amount && baseAmount < coupon.minimum_booking_amount) {
    throw new BadRequestError(
      `Booking base amount (₹${(baseAmount / 100).toFixed(2)}) is below the minimum required amount (₹${(
        coupon.minimum_booking_amount / 100
      ).toFixed(2)}) for coupon '${normalizedCode}'`,
      null,
      'COUPON_MIN_AMOUNT_NOT_MET'
    );
  }

  // 7. Total usage limit
  if (coupon.used_count >= coupon.usage_limit) {
    throw new BadRequestError(
      `Coupon '${normalizedCode}' has reached its total usage limit`,
      null,
      'COUPON_LIMIT_REACHED'
    );
  }

  // 8. Per-customer limit
  if (context.guestId && coupon.per_customer_limit) {
    const customerRedemptions = await CouponRedemption.countDocuments(
      {
        coupon_id: coupon.coupon_id,
        guest_id: context.guestId,
        status: { $in: ['PENDING', 'SUCCESS', 'USED'] },
      },
      queryOpts
    );

    if (customerRedemptions >= coupon.per_customer_limit) {
      throw new BadRequestError(
        `You have already reached the redemption limit (${coupon.per_customer_limit}) for coupon '${normalizedCode}'`,
        null,
        'COUPON_PER_CUSTOMER_LIMIT_EXCEEDED'
      );
    }
  }

  // Calculate discount amount in paise
  let discountAmount = 0;
  if (coupon.discount_type === 'PERCENTAGE') {
    discountAmount = Math.round((baseAmount * coupon.discount_value) / 100);
  } else if (coupon.discount_type === 'FIXED') {
    discountAmount = coupon.discount_value;
  }

  // Cap at maximum_discount
  if (coupon.maximum_discount && discountAmount > coupon.maximum_discount) {
    discountAmount = coupon.maximum_discount;
  }

  discountAmount = Math.min(discountAmount, baseAmount);

  return { coupon, discountAmount };
};

/**
 * Atomically redeems a coupon inside the booking transaction.
 * Uses atomic findOneAndUpdate with condition { used_count < usage_limit } and $inc used_count.
 * Inserts a CouponRedemption document.
 *
 * @param {Object} coupon - Coupon document
 * @param {string} reservationId
 * @param {string} guestId
 * @param {number} discountAmount
 * @param {Object} [options] - e.g. { session }
 * @returns {Promise<{ updatedCoupon: Object, redemption: Object }>}
 */
export const redeemCouponAtomically = async (
  coupon,
  reservationId,
  guestId,
  discountAmount,
  options = {}
) => {
  const queryOpts = options.session ? { session: options.session } : {};

  // Atomic increment with condition: only succeeds if used_count < usage_limit
  const updatedCoupon = await Coupon.findOneAndUpdate(
    {
      coupon_id: coupon.coupon_id,
      status: 'ACTIVE',
      $expr: { $lt: ['$used_count', '$usage_limit'] },
    },
    { $inc: { used_count: 1 } },
    { new: true, ...queryOpts }
  );

  if (!updatedCoupon) {
    throw new ConflictError(
      `Coupon '${coupon.code}' usage limit has been reached by concurrent bookings`,
      null,
      'COUPON_LIMIT_REACHED'
    );
  }

  // Insert CouponRedemption document
  const redemptionId = await getNextBusinessId(CouponRedemption, 'redemption_id', 'RED-', 3);
  const [redemption] = await CouponRedemption.create(
    [
      {
        redemption_id: redemptionId,
        coupon_id: coupon.coupon_id,
        reservation_id: reservationId,
        guest_id: guestId,
        discount_amount: discountAmount,
        status: 'PENDING',
        redeemed_at: new Date(),
      },
    ],
    queryOpts
  );

  return { updatedCoupon, redemption };
};

export default {
  validateCoupon,
  redeemCouponAtomically,
};
