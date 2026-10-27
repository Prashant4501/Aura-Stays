import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Reservation, Inventory } from '../src/models/index.js';
import { expireStaleReservations } from '../src/services/expirationService.js';

describe('Availability, Pricing & Reservation Concurrency Integration Tests', () => {
  let guestAccessToken = '';
  let guest2AccessToken = '';

  before(async () => {
    await connectDB();

    // Login Guest 1
    const g1Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'guest1@example.com', password: 'Password@123' });
    guestAccessToken = g1Res.body.accessToken;

    // Login Guest 2
    const g2Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'guest2@example.com', password: 'Password@123' });
    guest2AccessToken = g2Res.body.accessToken;
  });

  after(async () => {
    // Clean up created reservations and inventories from tests
    const testReservations = await Reservation.find({
      check_in_date: { $gte: new Date('2026-11-01T00:00:00Z') },
    }).lean();

    const testResIds = testReservations.map((r) => r.reservation_id);
    await Reservation.deleteMany({ reservation_id: { $in: testResIds } });
    await Inventory.deleteMany({ reservation_id: { $in: testResIds } });

    await disconnectDB();
  });

  // 1. GET /properties and /properties/:id
  it('GET /api/v1/properties - public endpoint returns only ACTIVE properties', async () => {
    const res = await request(app).get('/api/v1/properties').expect(200);

    assert.ok(Array.isArray(res.body.properties));
    assert.ok(res.body.properties.length >= 2);
    for (const prop of res.body.properties) {
      assert.equal(prop.status, 'ACTIVE');
    }
  });

  it('GET /api/v1/properties/:id - returns property details and room types', async () => {
    const res = await request(app).get('/api/v1/properties/PROP-001').expect(200);

    assert.equal(res.body.property.property_id, 'PROP-001');
    assert.equal(res.body.property.name, 'Grand Mumbai Hotel');
    assert.ok(Array.isArray(res.body.room_types));
    assert.ok(res.body.room_types.length >= 1);
  });

  it('GET /api/v1/properties/:id - returns 404 for non-existent property', async () => {
    const res = await request(app).get('/api/v1/properties/PROP-999').expect(404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
  });

  // 2. Room Availability Search
  it('GET /api/v1/rooms/search - finds available rooms for valid future dates and capacity', async () => {
    const res = await request(app)
      .get('/api/v1/rooms/search')
      .query({
        property_id: 'PROP-001',
        check_in: '2026-11-10',
        check_out: '2026-11-15',
        guests: 2,
      })
      .expect(200);

    assert.ok(res.body.available_rooms.length > 0);
    for (const room of res.body.available_rooms) {
      assert.equal(room.property_id, 'PROP-001');
      assert.ok(['AVAILABLE', 'ACTIVE'].includes(room.status));
      assert.ok(room.max_guests >= 2);
      assert.ok(room.pricing_quote, 'Must include estimated pricing quote');
    }
  });

  // 3. Server-side Pricing Quote Endpoint
  it('POST /api/v1/reservations/quote - computes trusted server-side price breakdown', async () => {
    const res = await request(app)
      .post('/api/v1/reservations/quote')
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2026-11-11', // Wednesday
        check_out_date: '2026-11-13', // Friday (2 nights)
        guests_count: 2,
      })
      .expect(200);

    const quote = res.body.quote;
    assert.equal(quote.nights_count, 2);
    // Base price for ROOM-101 (RTYP-001) is 300000 paise/night * 2 = 600000
    assert.equal(quote.base_amount, 600000);
    assert.equal(quote.discount_amount, 0);
    assert.equal(quote.net_amount, 600000);
    // 12% tax = 72000
    assert.equal(quote.tax_amount, 72000);
    // Service fee = 50000
    assert.equal(quote.service_fee, 50000);
    // Total = 722000 paise (₹7,220.00)
    assert.equal(quote.total_amount, 722000);
  });

  // 4. Defense against Price Manipulation
  it('POST /api/v1/reservations - strictly rejects requests attempting to inject price/total_amount (400)', async () => {
    const manipulatedPayload = {
      property_id: 'PROP-001',
      room_id: 'ROOM-101',
      check_in_date: '2026-11-15',
      check_out_date: '2026-11-17',
      guests_count: 2,
      total_amount: 500, // Attacker attempts to pay ₹5 instead of ₹7,220!
      price: 100,
    };

    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .send(manipulatedPayload)
      .expect(400);

    assert.ok(res.body.error);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.match(
      JSON.stringify(res.body.error),
      /unrecognized_keys|total_amount|price/i,
      'Price manipulation attempt must be rejected'
    );
  });

  // 5. Reservation Creation & Hold
  it('POST /api/v1/reservations - creates PENDING reservation with 15m hold and inventory documents', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .send({
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2026-11-15',
        check_out_date: '2026-11-18', // 3 nights: 15, 16, 17 Nov
        guests_count: 2,
      })
      .expect(201);

    const reservation = res.body.reservation;
    assert.equal(reservation.status, 'PENDING');
    assert.equal(reservation.room_id, 'ROOM-101');
    assert.equal(reservation.guest_id, 'GST-001');
    assert.ok(reservation.hold_expires_at);

    // Verify 3 inventory documents were created in database
    const inventory = await Inventory.find({ reservation_id: reservation.reservation_id }).sort({
      date: 1,
    });
    assert.equal(inventory.length, 3, 'Exactly 3 inventory documents must be created for 3 nights');
    assert.equal(inventory[0].status, 'HOLD');
  });

  // 6. Role Scoping & 404 Ownership Enforcement
  it('GET /api/v1/reservations/:id - Guest 2 receives 404 (NOT 403) when requesting Guest 1 reservation', async () => {
    // Find Guest 1 reservation
    const g1Res = await Reservation.findOne({ guest_id: 'GST-001' });

    const res = await request(app)
      .get(`/api/v1/reservations/${g1Res.reservation_id}`)
      .set('Authorization', `Bearer ${guest2AccessToken}`)
      .expect(404);

    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(res.body.error.message, 'Reservation not found');
  });

  // 7. Stale Hold Expiration
  it('Hold Expiration Job - expires pending reservations past hold_expires_at and deletes inventory', async () => {
    // Create a dummy stale reservation with hold_expires_at in the past
    const staleRes = await Reservation.create({
      reservation_id: 'RES-STALE-TEST',
      reservation_number: 'RES-26-9999',
      guest_id: 'GST-001',
      property_id: 'PROP-001',
      room_id: 'ROOM-201',
      check_in_date: new Date('2026-11-20T00:00:00Z'),
      check_out_date: new Date('2026-11-22T00:00:00Z'),
      guests_count: 2,
      base_amount: 1000000,
      tax_amount: 120000,
      service_fee: 50000,
      total_amount: 1170000,
      status: 'PENDING',
      hold_expires_at: new Date(Date.now() - 60000), // 1 minute in the past
    });

    // Create corresponding inventory documents
    await Inventory.create([
      {
        inventory_id: 'INV-TEST-STALE-1',
        room_id: 'ROOM-201',
        date: new Date('2026-11-20T00:00:00Z'),
        reservation_id: staleRes.reservation_id,
        status: 'HOLD',
      },
      {
        inventory_id: 'INV-TEST-STALE-2',
        room_id: 'ROOM-201',
        date: new Date('2026-11-21T00:00:00Z'),
        reservation_id: staleRes.reservation_id,
        status: 'HOLD',
      },
    ]);

    // Run expiration sweep
    const expiredCount = await expireStaleReservations();
    assert.ok(expiredCount >= 1);

    // Verify reservation status changed to EXPIRED
    const updated = await Reservation.findOne({ reservation_id: staleRes.reservation_id });
    assert.equal(updated.status, 'EXPIRED');

    // Verify inventory documents were deleted
    const invCount = await Inventory.countDocuments({ reservation_id: staleRes.reservation_id });
    assert.equal(invCount, 0, 'Inventory documents must be deleted upon expiration');
  });

  // 8. THE ULTIMATE CONCURRENCY RACE CONDITION TEST
  // 20 parallel POST /reservations for the same room and dates asserting:
  // Exactly ONE returns 201 and the remaining 19 return 409 Conflict.
  it('Concurrency Test: 20 parallel requests for same room and dates -> exactly 1 succeeds (201), 19 rejected (409)', async () => {
    const targetRoomId = 'ROOM-301'; // Sunset Goa Resort Suite
    const targetPropertyId = 'PROP-002';
    const checkIn = '2026-12-20';
    const checkOut = '2026-12-25'; // 5 nights

    // Ensure room has no prior inventory for these dates
    await Inventory.deleteMany({
      room_id: targetRoomId,
      date: {
        $gte: new Date('2026-12-20T00:00:00Z'),
        $lt: new Date('2026-12-25T00:00:00Z'),
      },
    });

    const bookingPayload = {
      property_id: targetPropertyId,
      room_id: targetRoomId,
      check_in_date: checkIn,
      check_out_date: checkOut,
      guests_count: 2,
    };

    // Dispatch 20 simultaneous parallel reservation requests
    const CONCURRENT_REQUESTS = 20;
    const promises = Array.from({ length: CONCURRENT_REQUESTS }, (_, idx) => {
      // Alternate tokens between Guest 1 and Guest 2
      const token = idx % 2 === 0 ? guestAccessToken : guest2AccessToken;
      return request(app)
        .post('/api/v1/reservations')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingPayload);
    });

    const responses = await Promise.all(promises);

    // Group responses by HTTP status code
    const successResponses = responses.filter((r) => r.status === 201);
    const conflictResponses = responses.filter((r) => r.status === 409);
    const otherResponses = responses.filter((r) => r.status !== 201 && r.status !== 409);

    console.log('\n--- 20 PARALLEL CONCURRENT RESERVATION REQUESTS RESULT ---');
    console.log(`201 Created:   ${successResponses.length}`);
    console.log(`409 Conflict:  ${conflictResponses.length}`);
    console.log(`Other Statuses: ${otherResponses.length}`);
    if (otherResponses.length > 0) {
      console.log(
        'Other response errors:',
        otherResponses.map((r) => ({ status: r.status, body: r.body }))
      );
    }
    console.log('----------------------------------------------------------\n');

    // Strict assertions:
    assert.equal(otherResponses.length, 0, 'No unexpected HTTP status codes allowed');
    assert.equal(
      successResponses.length,
      1,
      'EXACTLY ONE concurrent request must succeed with 201 Created'
    );
    assert.equal(
      conflictResponses.length,
      19,
      'EXACTLY 19 concurrent requests must be rejected with 409 Conflict'
    );

    // Verify friendly error message on 409
    const sampleConflict = conflictResponses[0].body;
    assert.ok(sampleConflict.error);
    assert.equal(sampleConflict.error.code, 'ROOM_ALREADY_BOOKED');
    assert.match(
      sampleConflict.error.message,
      /already reserved|already booked/i,
      'Error message must be clear and user-friendly'
    );

    // Verify database state: exactly 5 inventory documents exist (1 per night)
    const winningResId = successResponses[0].body.reservation.reservation_id;
    const inventory = await Inventory.find({
      room_id: targetRoomId,
      date: {
        $gte: new Date('2026-12-20T00:00:00Z'),
        $lt: new Date('2026-12-25T00:00:00Z'),
      },
    });

    assert.equal(inventory.length, 5, 'Exactly 5 inventory documents must exist for the 5 nights');
    for (const inv of inventory) {
      assert.equal(
        inv.reservation_id,
        winningResId,
        'All inventory records must belong strictly to the single winning reservation'
      );
    }
  });
});
