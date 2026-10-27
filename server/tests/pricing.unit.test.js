import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCouponDiscount,
  calculateReservationQuote,
} from '../src/services/pricingService.js';

describe('Pricing Engine Unit Tests', () => {
  const standardRoomType = {
    room_type_id: 'RTYP-001',
    name: 'STANDARD',
    max_guests: 3,
    base_price_per_night: 300000, // ₹3,000.00 in paise
  };

  it('1. Weekday stay at base room price (Wednesday & Thursday nights)', () => {
    // 2026-11-18 (Wed) to 2026-11-20 (Fri) -> 2 weekday nights
    const quote = calculateReservationQuote({
      roomType: standardRoomType,
      pricingRules: [],
      checkInDate: '2026-11-18',
      checkOutDate: '2026-11-20',
      guestsCount: 2,
    });

    assert.equal(quote.nights_count, 2);
    // 2 nights * 300000 = 600000 paise base
    assert.equal(quote.base_amount, 600000);
    assert.equal(quote.discount_amount, 0);
    assert.equal(quote.net_amount, 600000);
    // 12% tax on 600000 = 72000 paise
    assert.equal(quote.tax_amount, 72000);
    // Service fee = 50000 paise
    assert.equal(quote.service_fee, 50000);
    // Total = 600000 + 72000 + 50000 = 722000 paise (₹7,220.00)
    assert.equal(quote.total_amount, 722000);
    assert.equal(quote.display.total_amount, 7220.0);
  });

  it('2. Weekend surcharge calculation (Friday & Saturday nights, 20% surcharge)', () => {
    // 2026-11-20 (Fri) to 2026-11-22 (Sun) -> 2 weekend nights
    const quote = calculateReservationQuote({
      roomType: standardRoomType,
      pricingRules: [],
      checkInDate: '2026-11-20',
      checkOutDate: '2026-11-22',
      guestsCount: 2,
      config: { weekendSurchargePercent: 20 },
    });

    assert.equal(quote.nights_count, 2);
    // Friday: 300000 base + 60000 (20%) surcharge = 360000
    // Saturday: 300000 base + 60000 (20%) surcharge = 360000
    // Total base_amount = 720000 paise
    assert.equal(quote.base_amount, 720000);
    assert.equal(quote.nightly_breakdown[0].weekend_surcharge, 60000);
    assert.equal(quote.nightly_breakdown[1].weekend_surcharge, 60000);

    // Tax 12% on 720000 = 86400
    assert.equal(quote.tax_amount, 86400);
    // Total = 720000 + 86400 + 50000 = 856400 paise
    assert.equal(quote.total_amount, 856400);
  });

  it('3. Seasonal price override matching seasonal date range', () => {
    const seasonalRule = {
      pricing_id: 'PRC-SEASONAL-01',
      room_type_id: 'RTYP-001',
      start_date: new Date('2026-12-01T00:00:00Z'),
      end_date: new Date('2026-12-31T23:59:59Z'),
      price_per_night: 450000, // ₹4,500.00
      pricing_type: 'SEASONAL',
      status: 'ACTIVE',
    };

    // 2026-12-08 (Tue) to 2026-12-10 (Thu) -> 2 seasonal weekday nights
    const quote = calculateReservationQuote({
      roomType: standardRoomType,
      pricingRules: [seasonalRule],
      checkInDate: '2026-12-08',
      checkOutDate: '2026-12-10',
      guestsCount: 2,
    });

    assert.equal(quote.nights_count, 2);
    // Overridden base price = 450000 per night * 2 = 900000
    assert.equal(quote.base_amount, 900000);
    assert.equal(quote.nightly_breakdown[0].pricing_type, 'SEASONAL');
    assert.equal(quote.nightly_breakdown[0].base_price, 450000);
  });

  it('4. Extra-guest surcharge above base occupancy', () => {
    // 3 guests in a room with base occupancy 2 (extra guest fee ₹500/night = 50000 paise)
    const quote = calculateReservationQuote({
      roomType: standardRoomType,
      pricingRules: [],
      checkInDate: '2026-11-18', // Wed
      checkOutDate: '2026-11-19', // Thu (1 night)
      guestsCount: 3,
      config: { baseOccupancy: 2, extraGuestRate: 50000 },
    });

    assert.equal(quote.nights_count, 1);
    // 300000 base + 50000 (1 extra guest) = 350000 paise
    assert.equal(quote.nightly_breakdown[0].extra_guest_charge, 50000);
    assert.equal(quote.base_amount, 350000);
  });

  it('5. Coupon discount application (Percentage Coupon with Cap)', () => {
    const percentageCoupon = {
      coupon_id: 'CPN-005',
      code: 'SUMMER15',
      discount_type: 'PERCENTAGE',
      discount_value: 20, // 20%
      maximum_discount: 100000, // Cap at ₹1,000.00 (100000 paise)
      minimum_booking_amount: 500000, // Min booking ₹5,000.00
      status: 'ACTIVE',
    };

    // Booking base amount = 600000 paise (₹6,000.00). 20% would be 120000, capped at 100000.
    const discount = calculateCouponDiscount(percentageCoupon, 600000);
    assert.equal(discount, 100000, 'Discount must be capped at maximum_discount of 100000');

    // Below minimum booking amount
    const noDiscount = calculateCouponDiscount(percentageCoupon, 400000);
    assert.equal(noDiscount, 0, 'Discount must be 0 if below minimum booking amount');
  });

  it('6. Coupon discount application (Fixed Coupon)', () => {
    const fixedCoupon = {
      coupon_id: 'CPN-006',
      code: 'FLAT1500',
      discount_type: 'FIXED',
      discount_value: 150000, // ₹1,500.00
      maximum_discount: 150000,
      minimum_booking_amount: 300000,
      status: 'ACTIVE',
    };

    const discount = calculateCouponDiscount(fixedCoupon, 500000);
    assert.equal(discount, 150000);
  });

  it('7. Property-restricted and guest-restricted coupons', () => {
    const restrictedCoupon = {
      coupon_id: 'CPN-007',
      code: 'PROPONLY',
      discount_type: 'FIXED',
      discount_value: 100000,
      applicable_property_id: 'PROP-002',
      restricted_guest_id: 'GST-001',
      status: 'ACTIVE',
    };

    // Valid property and guest
    const validDiscount = calculateCouponDiscount(restrictedCoupon, 500000, {
      propertyId: 'PROP-002',
      guestId: 'GST-001',
    });
    assert.equal(validDiscount, 100000);

    // Ineligible property
    const invalidPropDiscount = calculateCouponDiscount(restrictedCoupon, 500000, {
      propertyId: 'PROP-001',
      guestId: 'GST-001',
    });
    assert.equal(invalidPropDiscount, 0);

    // Ineligible guest
    const invalidGuestDiscount = calculateCouponDiscount(restrictedCoupon, 500000, {
      propertyId: 'PROP-002',
      guestId: 'GST-002',
    });
    assert.equal(invalidGuestDiscount, 0);
  });
});
