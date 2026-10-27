import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Reservation, Inventory, Payment, Refund, AuditLog } from '../src/models/index.js';
import {
  calculateCancellationRefund,
  isValidTransition,
  transitionReservation,
} from '../src/services/reservationStateMachine.js';
import { paymentGateway } from '../src/services/paymentGateway.js';

describe('Reservation State Machine, Cancellation & Refunds Lifecycle Tests', () => {
  let guest1Token = '';
  let guest2Token = '';
  let managerToken = '';
  let adminToken = '';
  const guest1Id = 'GST-001';

  before(async () => {
    await connectDB();

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

    // Login Property Manager 1 (manages PROP-001)
    const mRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager1@example.com', password: 'Password@123' });
    managerToken = mRes.body.accessToken;

    // Login Admin
    const aRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password@123' });
    adminToken = aRes.body.accessToken;

    paymentGateway.reset();

    // Clean up test data before running
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayAfter = new Date(today);
    dayAfter.setUTCDate(today.getUTCDate() + 3);

    await Inventory.deleteMany({
      $or: [
        { date: { $gte: new Date('2029-01-01T00:00:00Z') } },
        { room_id: 'ROOM-102', date: { $gte: today, $lte: dayAfter } },
      ],
    });
    await Reservation.deleteMany({
      $or: [
        { check_in_date: { $gte: new Date('2029-01-01T00:00:00Z') } },
        { room_id: 'ROOM-102', check_in_date: { $gte: today, $lte: dayAfter } },
      ],
    });
  });

  after(async () => {
    // Cleanup lifecycle test reservations, inventories, payments, refunds
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayAfter = new Date(today);
    dayAfter.setUTCDate(today.getUTCDate() + 3);

    const testReservations = await Reservation.find({
      $or: [
        { check_in_date: { $gte: new Date('2029-01-01T00:00:00Z') } },
        { room_id: 'ROOM-102', check_in_date: { $gte: today, $lte: dayAfter } },
      ],
    }).lean();

    const testResIds = testReservations.map((r) => r.reservation_id);
    await Reservation.deleteMany({ reservation_id: { $in: testResIds } });
    await Inventory.deleteMany({
      $or: [
        { reservation_id: { $in: testResIds } },
        { room_id: 'ROOM-102', date: { $gte: today, $lte: dayAfter } },
      ],
    });
    await Payment.deleteMany({ reservation_id: { $in: testResIds } });
    await Refund.deleteMany({ reservation_id: { $in: testResIds } });
    await AuditLog.deleteMany({ entity_id: { $in: testResIds } });

    await disconnectDB();
  });

  // ==========================================
  // 1. REFUND TIERS PURE CALCULATION TESTS
  // ==========================================

  it('Refund tier calculation at 72h before check-in -> 100% refund, 0 fee', () => {
    const originalAmount = 1000000; // ₹10,000 in paise
    const now = new Date('2029-01-01T12:00:00Z');
    const checkIn72h = new Date('2029-01-04T12:00:00Z'); // Exactly 72h

    const result = calculateCancellationRefund(checkIn72h, originalAmount, now);

    assert.equal(result.tier, 'FULL_REFUND');
    assert.equal(result.refundPercentage, 100);
    assert.equal(result.refundAmount, 1000000);
    assert.equal(result.cancellationFee, 0);
    assert.equal(result.hoursUntilCheckIn, 72);
  });

  it('Refund tier calculation at 36h before check-in -> 50% refund, 50% fee', () => {
    const originalAmount = 1000000; // ₹10,000
    const now = new Date('2029-01-01T12:00:00Z');
    const checkIn36h = new Date('2029-01-03T00:00:00Z'); // Exactly 36h

    const result = calculateCancellationRefund(checkIn36h, originalAmount, now);

    assert.equal(result.tier, 'PARTIAL_REFUND');
    assert.equal(result.refundPercentage, 50);
    assert.equal(result.refundAmount, 500000);
    assert.equal(result.cancellationFee, 500000);
    assert.equal(result.hoursUntilCheckIn, 36);
  });

  it('Refund tier calculation at 12h before check-in -> 0% refund, 100% fee', () => {
    const originalAmount = 1000000; // ₹10,000
    const now = new Date('2029-01-01T12:00:00Z');
    const checkIn12h = new Date('2029-01-02T00:00:00Z'); // Exactly 12h

    const result = calculateCancellationRefund(checkIn12h, originalAmount, now);

    assert.equal(result.tier, 'NO_REFUND');
    assert.equal(result.refundPercentage, 0);
    assert.equal(result.refundAmount, 0);
    assert.equal(result.cancellationFee, 1000000);
    assert.equal(result.hoursUntilCheckIn, 12);
  });

  // ==========================================
  // 2. STATE MACHINE INVALID TRANSITIONS TABLE
  // ==========================================

  it('State Machine: Table of invalid transitions all return false and reject with 409 Conflict', async () => {
    const invalidTransitionsTable = [
      { from: 'PENDING', to: 'CHECKED_IN' },
      { from: 'PENDING', to: 'CHECKED_OUT' },
      { from: 'PENDING', to: 'REFUNDED' },
      { from: 'CONFIRMED', to: 'CHECKED_OUT' },
      { from: 'CONFIRMED', to: 'REFUNDED' },
      { from: 'CHECKED_IN', to: 'CANCELLED' },
      { from: 'CHECKED_IN', to: 'CONFIRMED' },
      { from: 'CHECKED_OUT', to: 'CANCELLED' },
      { from: 'CHECKED_OUT', to: 'CHECKED_IN' },
      { from: 'CANCELLED', to: 'CHECKED_IN' },
      { from: 'CANCELLED', to: 'CONFIRMED' },
      { from: 'CANCELLED', to: 'REFUND_PENDING', payment: false },
      { from: 'REFUND_PENDING', to: 'CHECKED_IN' },
      { from: 'REFUND_PENDING', to: 'CANCELLED' },
      { from: 'REFUNDED', to: 'CONFIRMED' },
      { from: 'REFUNDED', to: 'PENDING' },
      { from: 'EXPIRED', to: 'CONFIRMED' },
      { from: 'EXPIRED', to: 'CHECKED_IN' },
    ];

    for (const { from, to, payment = false } of invalidTransitionsTable) {
      const valid = isValidTransition(from, to, { hasSuccessfulPayment: payment });
      assert.equal(valid, false, `Transition ${from} -> ${to} must be illegal`);

      await assert.rejects(
        async () => {
          await transitionReservation({
            reservationId: 'DUMMY-RES',
            fromStatus: from,
            toStatus: to,
            hasSuccessfulPayment: payment,
          });
        },
        (err) => {
          assert.equal(err.statusCode, 409, `Transition ${from} -> ${to} must throw 409 Conflict`);
          assert.equal(err.code, 'INVALID_STATE_TRANSITION');
          return true;
        }
      );
    }
  });

  // ==========================================
  // 3. CHECK-IN AND CHECK-OUT LIFECYCLE
  // ==========================================

  it('Check-in: Guest caller receives 403 Forbidden (Only Admin/Manager allowed)', async () => {
    const res = await request(app)
      .post('/api/v1/reservations/RES-001/check-in')
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(403);

    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('Check-in: Rejects early check-in before check_in_date (400 CHECKIN_TOO_EARLY)', async () => {
    // Create a CONFIRMED reservation with check-in date 7 days in the future
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2029-02-10',
        check_out_date: '2029-02-12',
        guests_count: 1,
      })
      .expect(201);

    const resId = bookingRes.body.reservation.reservation_id;

    // Confirm via payment
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', `IDEMP-CHECKIN-EARLY-${resId}`)
      .send({
        reservation_id: resId,
        payment_method: 'CARD',
      })
      .expect(200);

    // Attempt check-in by Property Manager while check_in_date is in the future
    const checkInRes = await request(app)
      .post(`/api/v1/reservations/${resId}/check-in`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(400);

    assert.equal(checkInRes.body.error.code, 'CHECKIN_TOO_EARLY');
    assert.match(
      checkInRes.body.error.message,
      /only permitted on or after the scheduled check-in date/i
    );
  });

  it('Valid Check-In and Check-Out lifecycle by Property Manager', async () => {
    // 1. Create a reservation with check_in_date set to today/past so check-in is allowed
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayAfter = new Date(today);
    dayAfter.setUTCDate(today.getUTCDate() + 2);

    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-102',
        check_in_date: today.toISOString().split('T')[0],
        check_out_date: dayAfter.toISOString().split('T')[0],
        guests_count: 1,
      })
      .expect(201);

    const resId = bookingRes.body.reservation.reservation_id;

    // 2. Pay to CONFIRM reservation
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', `IDEMP-CHECKIN-SUCCESS-${resId}`)
      .send({
        reservation_id: resId,
        payment_method: 'UPI',
      })
      .expect(200);

    // 3. Manager checks in guest (CONFIRMED -> CHECKED_IN)
    const checkInRes = await request(app)
      .post(`/api/v1/reservations/${resId}/check-in`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    assert.equal(checkInRes.body.reservation.status, 'CHECKED_IN');

    // 4. Manager checks out guest (CHECKED_IN -> CHECKED_OUT)
    const checkOutRes = await request(app)
      .post(`/api/v1/reservations/${resId}/check-out`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);

    assert.equal(checkOutRes.body.reservation.status, 'CHECKED_OUT');

    // Verify DB
    const finalRes = await Reservation.findOne({ reservation_id: resId }).lean();
    assert.equal(finalRes.status, 'CHECKED_OUT');
  });

  it('Rule: A CHECKED_OUT reservation can never be cancelled (409 Conflict)', async () => {
    // Find a checked-out reservation belonging to Guest 1
    const checkedOutRes = await Reservation.findOne({
      status: 'CHECKED_OUT',
      guest_id: guest1Id,
    }).lean();
    assert.ok(checkedOutRes, 'A checked-out reservation for Guest 1 must exist');

    // Guest attempts to cancel checked-out reservation
    const res = await request(app)
      .post(`/api/v1/reservations/${checkedOutRes.reservation_id}/cancel`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(409);

    assert.equal(res.body.error.code, 'INVALID_STATE_TRANSITION');
    assert.match(res.body.error.message, /checked-out reservation can never be cancelled/i);
  });

  // ==========================================
  // 4. CANCELLATION PREVIEW & CANCELLATION
  // ==========================================

  it('GET /reservations/:id/cancellation-preview - displays accurate refund tier before confirmation', async () => {
    // 1. Create a reservation at 72+ hours in the future
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2029-03-01',
        check_out_date: '2029-03-03',
        guests_count: 1,
      })
      .expect(201);

    const resId = bookingRes.body.reservation.reservation_id;

    // 2. Pay to CONFIRM
    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', `IDEMP-PREVIEW-${resId}`)
      .send({
        reservation_id: resId,
        payment_method: 'CARD',
      })
      .expect(200);

    // 3. Preview cancellation
    const previewRes = await request(app)
      .get(`/api/v1/reservations/${resId}/cancellation-preview`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(200);

    assert.equal(previewRes.body.reservation_id, resId);
    assert.equal(previewRes.body.status, 'CONFIRMED');
    assert.equal(previewRes.body.refund_tier, 'FULL_REFUND');
    assert.equal(previewRes.body.refund_percentage, 100);
    assert.equal(previewRes.body.cancellation_fee, 0);
    assert.ok(previewRes.body.refund_amount > 0);
    assert.equal(previewRes.body.has_successful_payment, true);
    assert.equal(previewRes.body.can_cancel, true);
  });

  it('Cancellation: Tampered refund fields in body are strictly rejected with 400', async () => {
    const res = await request(app)
      .post('/api/v1/reservations/RES-001/cancel')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        refund_amount: 99999999, // FORBIDDEN
        cancellation_fee: 0, // FORBIDDEN
      })
      .expect(400);

    const errStr = JSON.stringify(res.body.error);
    assert.ok(
      errStr.includes('REFUND_MANIPULATION_DETECTED') || errStr.includes('Unrecognized key'),
      'Should reject client-supplied refund fields'
    );
  });

  it('Cancellation of PENDING reservation deletes inventory and moves to CANCELLED without refund', async () => {
    // 1. Create a PENDING reservation
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2029-03-10',
        check_out_date: '2029-03-12',
        guests_count: 1,
      })
      .expect(201);

    const resId = bookingRes.body.reservation.reservation_id;

    // Verify inventory holds exist
    const invCountBefore = await Inventory.countDocuments({ reservation_id: resId });
    assert.equal(invCountBefore, 2);

    // 2. Cancel PENDING reservation
    const cancelRes = await request(app)
      .post(`/api/v1/reservations/${resId}/cancel`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({ reason: 'Changed my travel plans' })
      .expect(200);

    assert.equal(cancelRes.body.reservation.status, 'CANCELLED');
    assert.equal(cancelRes.body.refund, null, 'No refund should be created for unpaid reservation');

    // 3. Verify inventory documents are deleted
    const invCountAfter = await Inventory.countDocuments({ reservation_id: resId });
    assert.equal(invCountAfter, 0, 'Inventory documents must be deleted on cancellation');
  });

  it('Cancellation of CONFIRMED reservation moves to REFUND_PENDING, creates Refund record and releases inventory', async () => {
    // 1. Create reservation
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2029-03-15',
        check_out_date: '2029-03-17',
        guests_count: 1,
      })
      .expect(201);

    const resId = bookingRes.body.reservation.reservation_id;

    // 2. Confirm with payment
    const payRes = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', `IDEMP-CANCEL-PAID-${resId}`)
      .send({
        reservation_id: resId,
        payment_method: 'CARD',
      })
      .expect(200);

    const paidAmount = payRes.body.payment.amount;

    // 3. Cancel reservation
    const cancelRes = await request(app)
      .post(`/api/v1/reservations/${resId}/cancel`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({ reason: 'Flight cancelled' })
      .expect(200);

    // Status must be REFUND_PENDING
    assert.equal(cancelRes.body.reservation.status, 'REFUND_PENDING');
    assert.ok(cancelRes.body.refund, 'Refund record must be created');
    assert.equal(cancelRes.body.refund.status, 'PENDING');
    assert.equal(cancelRes.body.refund.original_amount, paidAmount);
    assert.equal(cancelRes.body.refund.refund_amount, paidAmount); // 100% refund at 72h+

    // Verify inventory documents are deleted
    const invCount = await Inventory.countDocuments({ reservation_id: resId });
    assert.equal(invCount, 0, 'Inventory must be deleted upon cancellation');
  });

  it('Rule: A CANCELLED reservation can never be checked in (409 Conflict)', async () => {
    // Find a cancelled reservation in PROP-001 (managed by manager1)
    const cancelledRes = await Reservation.findOne({
      status: { $in: ['CANCELLED', 'REFUND_PENDING', 'REFUNDED'] },
      property_id: 'PROP-001',
    }).lean();
    assert.ok(cancelledRes, 'Cancelled reservation in PROP-001 must exist');

    // Attempt check-in by Property Manager
    const res = await request(app)
      .post(`/api/v1/reservations/${cancelledRes.reservation_id}/check-in`)
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(409);

    assert.equal(res.body.error.code, 'INVALID_STATE_TRANSITION');
    assert.match(res.body.error.message, /cancelled reservation can never be checked in/i);
  });

  it('Double cancel creates exactly ONE refund and returns 409 Conflict on second attempt', async () => {
    // 1. Create and pay reservation
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-102',
        check_in_date: '2029-03-20',
        check_out_date: '2029-03-22',
        guests_count: 1,
      })
      .expect(201);

    const resId = bookingRes.body.reservation.reservation_id;

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', `IDEMP-DOUBLE-CANCEL-${resId}`)
      .send({
        reservation_id: resId,
        payment_method: 'UPI',
      })
      .expect(200);

    // First cancel succeeds
    await request(app)
      .post(`/api/v1/reservations/${resId}/cancel`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(200);

    // Second cancel must fail with 409 Conflict
    const secondCancelRes = await request(app)
      .post(`/api/v1/reservations/${resId}/cancel`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(409);

    assert.equal(secondCancelRes.body.error.code, 'RESERVATION_ALREADY_CANCELLED');

    // Verify DB has exactly ONE refund for this reservation
    const refundCount = await Refund.countDocuments({ reservation_id: resId });
    assert.equal(refundCount, 1, 'Exactly one refund record must exist in DB');
  });

  // ==========================================
  // 5. REFUND PROCESSING & CONCURRENCY
  // ==========================================

  it('POST /refunds/:id/process - rejects GUEST callers with 403 Forbidden', async () => {
    const refund = await Refund.findOne().lean();
    assert.ok(refund, 'A refund document must exist');

    const res = await request(app)
      .post(`/api/v1/refunds/${refund.refund_id}/process`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(403);

    assert.equal(res.body.error.code, 'FORBIDDEN');
  });

  it('Concurrency Test: 10 parallel refund processing calls produce exactly ONE refund processed', async () => {
    // 1. Create a reservation, pay it, cancel it to get a PENDING refund
    const bookingRes = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guest1Token}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2029-04-01',
        check_out_date: '2029-04-03',
        guests_count: 1,
      })
      .expect(201);

    const resId = bookingRes.body.reservation.reservation_id;

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', `IDEMP-RACE-REFUND-PAY-${resId}`)
      .send({
        reservation_id: resId,
        payment_method: 'CARD',
      })
      .expect(200);

    const cancelRes = await request(app)
      .post(`/api/v1/reservations/${resId}/cancel`)
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(200);

    const refundId = cancelRes.body.refund.refund_id;

    // 2. Fire 10 parallel process requests simultaneously with Admin token
    const processRequests = Array.from({ length: 10 }, () => {
      return request(app)
        .post(`/api/v1/refunds/${refundId}/process`)
        .set('Authorization', `Bearer ${adminToken}`);
    });

    const responses = await Promise.all(processRequests);

    const successfulResponses = responses.filter((r) => r.status === 200);
    assert.equal(
      successfulResponses.length,
      10,
      'All 10 calls should resolve cleanly with 200 (idempotent)'
    );

    // 3. Verify Database state:
    // Exactly 1 refund processed
    const updatedRefund = await Refund.findOne({ refund_id: refundId }).lean();
    assert.equal(updatedRefund.status, 'PROCESSED');
    assert.ok(updatedRefund.refunded_at);

    // Reservation transitioned to REFUNDED
    const updatedRes = await Reservation.findOne({ reservation_id: resId }).lean();
    assert.equal(updatedRes.status, 'REFUNDED');

    // Exactly 1 AuditLog entry for REFUND_PROCESSED
    const auditLogsCount = await AuditLog.countDocuments({
      action: 'REFUND_PROCESSED',
      entity_id: refundId,
    });
    assert.equal(auditLogsCount, 1, 'Audit log must record exactly 1 REFUND_PROCESSED action');
  });

  it('Rule: A REFUNDED reservation can never accept a new payment (409 Conflict)', async () => {
    // Find a refunded reservation
    const refundedRes = await Reservation.findOne({ status: 'REFUNDED' }).lean();
    assert.ok(refundedRes, 'A refunded reservation must exist');

    // Attempt to make a payment on the refunded reservation
    const res = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${guest1Token}`)
      .set('Idempotency-Key', `IDEMP-PAY-REFUNDED-${refundedRes.reservation_id}`)
      .send({
        reservation_id: refundedRes.reservation_id,
        payment_method: 'CARD',
      })
      .expect(409);

    assert.equal(res.body.error.code, 'INVALID_STATE_TRANSITION');
    assert.match(res.body.error.message, /can never accept a new payment/i);
  });

  // ==========================================
  // 6. REFUND ROLE SCOPING & OWNERSHIP
  // ==========================================

  it('GET /api/v1/refunds - Guest only lists their own refunds', async () => {
    const res = await request(app)
      .get('/api/v1/refunds')
      .set('Authorization', `Bearer ${guest1Token}`)
      .expect(200);

    assert.ok(Array.isArray(res.body.refunds));
    for (const r of res.body.refunds) {
      assert.equal(r.guest_id, guest1Id, 'Guest must only see their own refunds');
    }
  });

  it('GET /api/v1/refunds/:id - Guest 2 receives 404 (NOT 403) for Guest 1 refund', async () => {
    // Find a refund belonging to Guest 1
    const g1Refund = await Refund.findOne({ guest_id: guest1Id }).lean();
    assert.ok(g1Refund, 'A refund for Guest 1 must exist');

    // Guest 2 requests Guest 1 refund
    const res = await request(app)
      .get(`/api/v1/refunds/${g1Refund.refund_id}`)
      .set('Authorization', `Bearer ${guest2Token}`)
      .expect(404);

    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.match(res.body.error.message, /not found/i);
  });
});
