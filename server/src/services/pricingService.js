import { generateNightsList, normalizeToUtcMidnight } from '../utils/dates.js';
import { toRupees } from '../utils/currency.js';

/**
 * Default Pricing Configuration Values.
 * All monetary values are strictly in paise (integers).
 */
export const DEFAULT_PRICING_CONFIG = {
  weekendSurchargePercent: 20, // 20% surcharge on Friday and Saturday nights
  taxPercent: 12, // 12% GST on net accommodation amount
  serviceFee: 50000, // ₹500.00 service fee in paise
  baseOccupancy: 2, // Extra charges apply above 2 guests
  extraGuestRate: 50000, // ₹500.00 per extra guest per night in paise
};

/**
 * Calculates price components for an individual night.
 * Pure function with no database side effects.
 *
 * @param {Object} params
 * @param {Date} params.date - Night date at UTC midnight
 * @param {Object} params.roomType - RoomType object { base_price_per_night, max_guests }
 * @param {Array} [params.pricingRules=[]] - RoomPricing documents
 * @param {number} [params.guestsCount=1] - Number of guests
 * @param {Object} [params.config] - Override configuration
 * @returns {Object} Night price breakdown in paise
 */
export const calculateNightlyPrice = ({
  date,
  roomType,
  pricingRules = [],
  guestsCount = 1,
  config = {},
}) => {
  const cfg = { ...DEFAULT_PRICING_CONFIG, ...config };
  const nightDate = normalizeToUtcMidnight(date);
  const dayOfWeek = nightDate.getUTCDay(); // 0 = Sun, 5 = Fri, 6 = Sat
  const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

  // 1. Base price / seasonal override
  let basePrice = roomType.base_price_per_night;
  let pricingType = 'BASE';

  // Check matching room_pricing rules
  for (const rule of pricingRules) {
    if (rule.status !== 'ACTIVE') continue;
    const ruleStart = normalizeToUtcMidnight(rule.start_date);
    const ruleEnd = normalizeToUtcMidnight(rule.end_date);

    if (nightDate.getTime() >= ruleStart.getTime() && nightDate.getTime() <= ruleEnd.getTime()) {
      basePrice = rule.price_per_night;
      pricingType = rule.pricing_type || 'SEASONAL';
      break;
    }
  }

  // 2. Weekend surcharge (Fri/Sat)
  const weekendSurcharge = isWeekend
    ? Math.round((basePrice * cfg.weekendSurchargePercent) / 100)
    : 0;

  // 3. Extra-guest charge above base occupancy
  const baseOccupancy = cfg.baseOccupancy ?? Math.min(2, roomType.max_guests);
  const extraGuests = Math.max(0, guestsCount - baseOccupancy);
  const extraGuestCharge = extraGuests * cfg.extraGuestRate;

  // 4. Night total
  const nightTotal = basePrice + weekendSurcharge + extraGuestCharge;

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    date: nightDate.toISOString().split('T')[0],
    day_of_week: dayNames[dayOfWeek],
    is_weekend: isWeekend,
    base_price: basePrice,
    pricing_type: pricingType,
    weekend_surcharge: weekendSurcharge,
    extra_guest_charge: extraGuestCharge,
    night_total: nightTotal,
  };
};

/**
 * Hook for coupon discount calculation.
 *
 * @param {Object|null} coupon - Coupon document
 * @param {number} baseAmount - Base accommodation amount in paise
 * @param {Object} [context={}] - { propertyId, guestId }
 * @returns {number} Discount amount in paise
 */
export const calculateCouponDiscount = (coupon, baseAmount, context = {}) => {
  if (!coupon || coupon.status !== 'ACTIVE') {
    return 0;
  }

  // Check minimum booking amount
  if (coupon.minimum_booking_amount && baseAmount < coupon.minimum_booking_amount) {
    return 0;
  }

  // Check property restriction
  if (
    coupon.applicable_property_id &&
    context.propertyId &&
    coupon.applicable_property_id !== context.propertyId
  ) {
    return 0;
  }

  // Check guest restriction
  if (
    coupon.restricted_guest_id &&
    context.guestId &&
    coupon.restricted_guest_id !== context.guestId
  ) {
    return 0;
  }

  let discount = 0;
  if (coupon.discount_type === 'PERCENTAGE') {
    discount = Math.round((baseAmount * coupon.discount_value) / 100);
  } else if (coupon.discount_type === 'FIXED') {
    discount = coupon.discount_value;
  }

  // Cap at maximum discount
  if (coupon.maximum_discount && discount > coupon.maximum_discount) {
    discount = coupon.maximum_discount;
  }

  return Math.min(discount, baseAmount);
};

/**
 * Calculates a comprehensive reservation quote with complete breakdown.
 * Pure function: ignores frontend manipulated financial values.
 *
 * @param {Object} params
 * @param {Object} params.roomType - RoomType entity
 * @param {Array} [params.pricingRules=[]] - List of RoomPricing documents
 * @param {Date|string} params.checkInDate - Check-in date
 * @param {Date|string} params.checkOutDate - Check-out date
 * @param {number} [params.guestsCount=1] - Number of guests
 * @param {Object|null} [params.coupon=null] - Coupon entity
 * @param {Object} [params.context={}] - Context { propertyId, guestId }
 * @param {Object} [params.config={}] - Pricing config overrides
 * @returns {Object} Complete quote breakdown in paise
 */
export const calculateReservationQuote = ({
  roomType,
  pricingRules = [],
  checkInDate,
  checkOutDate,
  guestsCount = 1,
  coupon = null,
  context = {},
  config = {},
}) => {
  const cfg = { ...DEFAULT_PRICING_CONFIG, ...config };
  const nightsList = generateNightsList(checkInDate, checkOutDate);

  if (nightsList.length === 0) {
    throw new Error('Stay must contain at least 1 night');
  }

  // Calculate each night's price
  const nightlyBreakdown = nightsList.map((nightDate) =>
    calculateNightlyPrice({
      date: nightDate,
      roomType,
      pricingRules,
      guestsCount,
      config: cfg,
    })
  );

  // Sum nightly totals
  const baseAmount = nightlyBreakdown.reduce((sum, n) => sum + n.night_total, 0);

  // Apply coupon discount hook
  const discountAmount = calculateCouponDiscount(coupon, baseAmount, context);
  const netAmount = Math.max(0, baseAmount - discountAmount);

  // Calculate tax on net amount
  const taxAmount = Math.round((netAmount * cfg.taxPercent) / 100);

  // Service fee
  const serviceFee = cfg.serviceFee;

  // Total final amount
  const totalAmount = netAmount + taxAmount + serviceFee;

  return {
    nights_count: nightsList.length,
    guests_count: guestsCount,
    nightly_breakdown: nightlyBreakdown,
    // Amounts in paise
    base_amount: baseAmount,
    discount_amount: discountAmount,
    net_amount: netAmount,
    tax_amount: taxAmount,
    tax_percent: cfg.taxPercent,
    service_fee: serviceFee,
    total_amount: totalAmount,
    // Human-readable representations in rupees for client UI
    display: {
      base_amount: toRupees(baseAmount),
      discount_amount: toRupees(discountAmount),
      net_amount: toRupees(netAmount),
      tax_amount: toRupees(taxAmount),
      service_fee: toRupees(serviceFee),
      total_amount: toRupees(totalAmount),
      currency: 'INR',
    },
  };
};

export default {
  calculateNightlyPrice,
  calculateCouponDiscount,
  calculateReservationQuote,
  DEFAULT_PRICING_CONFIG,
};
