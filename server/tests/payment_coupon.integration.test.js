import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Reservation, Inventory, Coupon, CouponRedemption, Payment } from '../src/models/index.js';
import { paymentGateway } from '../src/services/paymentGateway.js';

describe('Coupons & Payments Integration Tests', () => {
  let guest1Token = '';
  let guest2Token = '';
  const guest1Id = 'GST-001';

  before(async () => {
    await connectDB();

    // Clean up any leftovers from previous test runs
    await CouponRedemption.deleteMany({ redemption_id: { $ne: 'RED-001' } });
    await Coupon.updateMany(
      { coupon_id: { $in: ['CPN-005', 'CPN-006', 'CPN-007', 'CPN-008', 'CPN-009'] } },
      { $set: { used_count: 0 } }
    );
    await Payment.deleteMany({
      idempotency_key: { $regex: /^(KEY-|IDEMP-|RACE-)/ },
    });
    await Reservation.deleteMany({
      check_in_date: { $gte: new Date('2028-01-01T00:00:00Z') },
    });
    await Inventory.deleteMany({
      date: { $gte: new Date('2028-01-01T00:00:00Z') },
    });

    // Login Guest 1 (GST-001)
    const g1Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'guest1@example.com', password: 'Password@123' });
    guest1Token = g1Res.body.accessToken;

    // Login Guest 2 (GST-002)
    const g2Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'guest2@example.com', password: 'Password@123' });
    guest2Token = g2Res.body.accessToken;

    paymentGateway.reset();
  });

  after(async () => {
    // Cleanup any test payments, reservations, inventory and redemptions
    const testReservations = await Reservation.find({
      check_in_date: { $gte: new Date('2028-01-01T00:00:00Z') },
    }).lean();

    const testResIds = testReservations.map((r) => r.reservation_id);
    await Reservation.deleteMany({ reservation_id: { $in: testResIds } });
    await Inventory.deleteMany({ reservation_id: { $in: testResIds } });
    await Payment.deleteMany({ reservation_id: { $in: testResIds } });
    await CouponRedemption.deleteMany({ redemption_id: { $ne: 'RED-001' } });

    // Reset test coupons count
    await Coupon.updateMany(
      { coupon_id: { $in: ['CPN-005', 'CPN-006', 'CPN-007', 'CPN-008', 'CPN-009'] } },
      { $set: { used_count: 0 } }
    );

    await disconnectDB();
  });

  // ==========================================
  // 1. COUPON VALIDATION TESTS
  // ==========================================

  it('Expired coupon rejected - returns 400 Bad Request with COUPON_EXPIRED', async () => {
    const payload = {
      property_id: 'PROP-001',
      room_id: 'ROOM-101',
      check_in_date: '2028-06-10',
      check_out_date: '2028-06-12',
      guests_count: 2,
      coupon_code: 'SAVE20', // Expired coupon in mock_data.json (valid_until 2024-12-31)
    };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send(payload)
      .expect(400);

    assert.equal(res.body.error.code, 'COUPON_EXPIRED');
    assert.match(res.body.error.message, /expired/i);
  });

  it('Ineligible property coupon rejected - returns 400 with COUPON_PROPERTY_INELIGIBLE', async () => {
    // GOA30 (CPN-007) is restricted to PROP-002; attempting to use it on PROP-001 must be rejected
    const payload = {
      property_id: 'PROP-001',
      room_id: 'ROOM-101',
      check_in_date: '2028-06-15',
      check_out_date: '2028-06-18',
      guests_count: 2,
      coupon_code: 'GOA30',
    };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send(payload)
      .expect(400);

    assert.equal(res.body.error.code, 'COUPON_PROPERTY_INELIGIBLE');
    assert.match(res.body.error.message, /only valid for property PROP-002/i);
  });

  it('Restricted coupon used by wrong guest rejected - returns 400 with COUPON_CUSTOMER_RESTRICTED', async () => {
    // VIPGUEST (CPN-008) is strictly restricted to GST-001; GST-002 must be rejected
    const payload = {
      property_id: 'PROP-001',
      room_id: 'ROOM-101',
      check_in_date: '2028-06-20',
      check_out_date: '2028-06-22',
      guests_count: 2,
      coupon_code: 'VIPGUEST',
    };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest2Token}`) // Guest 2
      .send(payload)
      .expect(400);

    assert.equal(res.body.error.code, 'COUPON_CUSTOMER_RESTRICTED');
    assert.match(res.body.error.message, /restricted to another customer/i);
  });

  it('Restricted coupon used by eligible guest succeeds', async () => {
    // VIPGUEST (CPN-008) used by GST-001 succeeds
    const payload = {
      property_id: 'PROP-001',
      room_id: 'ROOM-101',
      check_in_date: '2028-06-25',
      check_out_date: '2028-06-27',
      guests_count: 2,
      coupon_code: 'VIPGUEST',
    };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`) // Guest 1 (GST-001)
      .send(payload)
      .expect(201);

    assert.equal(res.body.reservation.status, 'PENDING');
    // ₹2500 flat discount (250000 paise)
    assert.equal(res.body.reservation.discount_amount, 250000);
  });

  it('Tampered discount ignored and rejected by strict validation', async () => {
    // Attempting to inject client-supplied discount
    const payload = {
      property_id: 'PROP-001',
      room_id: 'ROOM-101',
      check_in_date: '2028-07-01',
      check_out_date: '2028-07-03',
      guests_count: 1,
      coupon_code: 'SUMMER15',
      discount: 999999, // FORBIDDEN
      total_amount: 100, // FORBIDDEN
    };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send(payload)
      .expect(400);

    const errStr = JSON.stringify(res.body.error);
    assert.ok(
      errStr.includes('PRICE_MANIPULATION_DETECTED') || errStr.includes('Unrecognized key'),
      'Should reject manipulated price/discount fields'
    );
  });

  it('Valid coupon calculates trusted discount server-side', async () => {
    // SUMMER15 (15% off) applied legitimately
    const payload = {
      property_id: 'PROP-001',
      room_id: 'ROOM-102',
      check_in_date: '2028-07-05',
      check_out_date: '2028-07-07',
      guests_count: 1,
      coupon_code: 'SUMMER15',
    };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send(payload)
      .expect(201);

    const { reservation, pricing_breakdown } = res.body;
    assert.ok(reservation.discount_amount > 0);
    // Calculated server-side as 15% of base_amount
    const expectedDiscount = Math.round((reservation.base_amount * 15) / 100);
    assert.equal(reservation.discount_amount, expectedDiscount);
    assert.equal(reservation.total_amount, pricing_breakdown.total_amount);
  });

  // ==========================================
  // 2. PARALLEL COUPON REDEMPTION RACE TEST
  // ==========================================

  it('Concurrency Test: 10 parallel redemptions of usage_limit-2 coupon allow exactly 2 and reject 8', async () => {
    // Reset FLASH50 used_count and any prior redemptions
    await Coupon.updateOne({ code: 'FLASH50' }, { $set: { used_count: 0 } });
    await CouponRedemption.deleteMany({ coupon_id: 'CPN-009' });

    // 10 parallel reservation bookings on non-overlapping dates for ROOM-101
    // Alternating between Guest 1 and Guest 2 (since FLASH50 has per_customer_limit: 1 and usage_limit: 2)
    const requests = Array.from({ length: 10 }, (_, i) => {
      const checkInDay = String(i * 3 + 1).padStart(2, '0');
      const checkOutDay = String(i * 3 + 3).padStart(2, '0');
      const token = i % 2 === 0 ? guest1Token : guest2Token;

      return request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${token}`)
        .send({
          property_id: 'PROP-001',
          room_id: 'ROOM-101',
          check_in_date: `2028-08-${checkInDay}`,
          check_out_date: `2028-08-${checkOutDay}`,
          guests_count: 1,
          coupon_code: 'FLASH50',
        });
    });

    const responses = await Promise.all(requests);

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter(
      (r) =>
        r.status === 409 ||
        (r.status === 400 &&
          (r.body.error?.code === 'COUPON_LIMIT_REACHED' ||
            r.body.error?.code === 'COUPON_PER_CUSTOMER_LIMIT_EXCEEDED' ||
            r.body.error?.message?.includes('usage limit') ||
            r.body.error?.message?.includes('redemption limit')))
    );

    console.log('\n--- 10 PARALLEL COUPON REDEMPTION RESULTS ---');
    console.log(`201 Created:   ${created.length}`);
    console.log(`Rejected (409/400): ${conflicts.length}`);
    console.log('--------------------------------------------\n');

    assert.equal(created.length, 2, 'Exactly 2 bookings should successfully redeem the coupon');
    assert.equal(conflicts.length, 8, 'Exactly 8 bookings should be rejected due to usage limit');

    // Verify database state: used_count must be exactly 2
    const couponDoc = await Coupon.findOne({ code: 'FLASH50' }).lean();
    assert.equal(couponDoc.used_count, 2, 'Coupon used_count in DB must be exactly 2');
  });

  // ==========================================
  // 3. PAYMENT PROCESSING & IDEMPOTENCY TESTS
  // ==========================================

  it('Payment requires Idempotency-Key header - returns 400 when missing', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        reservation_id: 'RES-001',
        payment_method: 'CARD',
      })
      .expect(400);

    assert.equal(res.body.error.code, 'IDEMPOTENCY_KEY_REQUIRED');
  });

  it('Manipulated amount in payment is strictly rejected with 400', async () => {
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', 'KEY-TAMPER-AMOUNT-001')
      .send({
        reservation_id: 'RES-001',
        payment_method: 'CARD',
        amount: 500, // FORBIDDEN: client trying to dictate payable amount
      })
      .expect(400);

    const errStr = JSON.stringify(res.body.error);
    assert.ok(
      errStr.includes('AMOUNT_MANIPULATION_DETECTED') || errStr.includes('Unrecognized key'),
      'Should reject client-supplied payment amount'
    );
  });

  it('Payment replay with the same key charges once and returns identical stored response', async () => {
    // 1. Create a fresh PENDING reservation
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-102',
        check_in_date: '2028-09-01',
        check_out_date: '2028-09-03',
        guests_count: 1,
      })
      .expect(201);

    const reservationId = bookingRes.body.reservation.reservation_id;
    const idempotencyKey = 'IDEMP-REPLAY-KEY-TEST-001';

    // 2. First payment attempt
    const firstPayRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        reservation_id: reservationId,
        payment_method: 'CARD',
      })
      .expect(200);

    assert.equal(firstPayRes.body.payment.status, 'SUCCESS');
    assert.equal(firstPayRes.body.payment.idempotency_key, idempotencyKey);
    assert.equal(firstPayRes.body.reservation.status, 'CONFIRMED');

    // 3. Replay with the EXACT SAME idempotency key
    const replayPayRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        reservation_id: reservationId,
        payment_method: 'CARD',
      })
      .expect(200);

    // Replay returns identical status and body
    assert.equal(replayPayRes.body.payment.payment_id, firstPayRes.body.payment.payment_id);
    assert.equal(
      replayPayRes.body.payment.payment_reference,
      firstPayRes.body.payment.payment_reference
    );
    assert.equal(replayPayRes.body.payment.amount, firstPayRes.body.payment.amount);

    // Ensure only ONE payment record exists in DB for this idempotency key
    const payDocsCount = await Payment.countDocuments({
      idempotency_key: idempotencyKey,
      guest_id: guest1Id,
    });
    assert.equal(payDocsCount, 1, 'Payment must be charged and stored exactly once in DB');
  });

  it('Payment gateway failure returns 400 and preserves PENDING reservation', async () => {
    // 1. Create a reservation
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-102',
        check_in_date: '2028-09-10',
        check_out_date: '2028-09-12',
        guests_count: 1,
      })
      .expect(201);

    const reservationId = bookingRes.body.reservation.reservation_id;

    // 2. Configure mock gateway to simulate failure
    paymentGateway.setMockOutcome('FAILURE');

    const failRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', 'IDEMP-FAIL-TEST-001')
      .send({
        reservation_id: reservationId,
        payment_method: 'CARD',
      })
      .expect(400);

    assert.equal(failRes.body.error.code, 'PAYMENT_DECLINED');

    // 3. Reservation should still be PENDING (not confirmed)
    const resDoc = await Reservation.findOne({ reservation_id: reservationId }).lean();
    assert.equal(resDoc.status, 'PENDING');

    // Reset gateway to SUCCESS
    paymentGateway.reset();
  });

  // ==========================================
  // 4. PARALLEL PAYMENTS CONCURRENCY TEST
  // ==========================================

  it('Concurrency Test: 10 parallel payments with different keys produce exactly one SUCCESS', async () => {
    // 1. Create a single PENDING reservation
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-102',
        check_in_date: '2028-09-15',
        check_out_date: '2028-09-17',
        guests_count: 1,
      })
      .expect(201);

    const reservationId = bookingRes.body.reservation.reservation_id;

    // 2. Launch 10 parallel payment requests with 10 different idempotency keys
    const paymentRequests = Array.from({ length: 10 }, (_, i) => {
      return request(app)
        .post('/api/v1/payments')
        .set('Authorization', `Bearer ${guest1Token}`)
        .set('Idempotency-Key', `RACE-KEY-${reservationId}-${i + 1}`)
        .send({
          reservation_id: reservationId,
          payment_method: 'CARD',
        });
    });

    const responses = await Promise.all(paymentRequests);

    const successes = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status === 409 || r.status === 400);

    console.log('\n--- 10 PARALLEL PAYMENTS RACE RESULTS ---');
    console.log(`200 OK (Success): ${successes.length}`);
    console.log(`Rejected (409/400):  ${rejected.length}`);
    console.log('-----------------------------------------\n');

    assert.equal(successes.length, 1, 'Exactly ONE payment request must succeed');
    assert.equal(rejected.length, 9, 'All 9 concurrent payment attempts must be rejected');

    // Verify DB: exactly 1 SUCCESS payment
    const dbSuccessCount = await Payment.countDocuments({
      reservation_id: reservationId,
      status: 'SUCCESS',
    });
    assert.equal(dbSuccessCount, 1, 'Database must have exactly 1 successful payment');

    // Verify Reservation is CONFIRMED
    const updatedRes = await Reservation.findOne({ reservation_id: reservationId }).lean();
    assert.equal(updatedRes.status, 'CONFIRMED');

    // Verify Inventory status updated to BOOKED
    const invDocs = await Inventory.find({ reservation_id: reservationId }).lean();
    assert.ok(invDocs.length > 0);
    for (const inv of invDocs) {
      assert.equal(inv.status, 'BOOKED');
    }
  });

  // ==========================================
  // 5. PAYMENT OWNERSHIP & ROLE SCOPING TESTS
  // ==========================================

  it('GET /api/v1/payments - lists only caller own payments for GUEST', async () => {
    const res = await request(app)
      .get('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(200);

    assert.ok(Array.isArray(res.body.payments));
    for (const pay of res.body.payments) {
      assert.equal(pay.guest_id, guest1Id, 'All payments must belong to Guest 1');
    }
  });

  it('GET /api/v1/payments/:id - Guest 2 receives 404 (NOT 403) for Guest 1 payment', async () => {
    // Find a payment belonging to Guest 1
    const g1Payment = await Payment.findOne({ guest_id: guest1Id }).lean();
    assert.ok(g1Payment, 'A payment for Guest 1 must exist');

    // Guest 2 requests Guest 1's payment
    const res = await request(app)
      .get(`/api/v1/payments/${g1Payment.payment_id}`)
      .set('Authorization', `Bearer ${guest2Token}`)
      .expect(404);

    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.match(res.body.error.message, /not found/i);
  });
});
