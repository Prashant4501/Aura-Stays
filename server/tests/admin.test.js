import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { Room, RoomPricing, Inventory, Reservation, Coupon } from '../src/models/index.js';

describe('Admin & Manager API Integration Tests with Strict Authorization', () => {
  let guest1Token = '';
  let guest2Token = '';
  let manager1Token = '';
  let manager2Token = '';
  let adminToken = '';

  before(async () => {
    await connectDB();

    // Login Guest 1
    const g1Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'guest1@example.com', password: 'Password@123' });
    guest1Token = g1Res.body.accessToken;

    // Login Guest 2
    const g2Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'guest2@example.com', password: 'Password@123' });
    guest2Token = g2Res.body.accessToken;

    // Login Manager 1 (manages PROP-001)
    const m1Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager1@example.com', password: 'Password@123' });
    manager1Token = m1Res.body.accessToken;

    // Login Manager 2 (manages PROP-002)
    const m2Res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'manager2@example.com', password: 'Password@123' });
    manager2Token = m2Res.body.accessToken;

    // Login Admin
    const aRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@example.com', password: 'Password@123' });
    adminToken = aRes.body.accessToken;

    // Clean up any temporary test records
    await Inventory.deleteMany({
      $or: [{ date: { $gte: new Date('2032-01-01T00:00:00Z') } }, { status: 'BLOCKED' }],
    });
    await RoomPricing.deleteMany({ pricing_id: /^PRC-TEST/ });
    await Coupon.deleteMany({ code: /^ADMINTEST/ });
  });

  after(async () => {
    await Inventory.deleteMany({
      $or: [{ date: { $gte: new Date('2032-01-01T00:00:00Z') } }, { status: 'BLOCKED' }],
    });
    await RoomPricing.deleteMany({ pricing_id: /^PRC-TEST/ });
    await Coupon.deleteMany({ code: /^ADMINTEST/ });
    await disconnectDB();
  });

  // =========================================================================
  // 1. Guest Role Authorization & 403 Access Denied
  // =========================================================================
  describe('1. Role Authorization: GUEST receives 403 on all admin/manager endpoints', () => {
    it('GUEST receives 403 on GET /api/v1/admin/properties', async () => {
      const res = await request(app)
        .get('/api/v1/admin/properties')
        .set('Authorization', `Bearer ${guest1Token}`);

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('GUEST receives 403 on POST /api/v1/admin/properties', async () => {
      const res = await request(app)
        .post('/api/v1/admin/properties')
        .set('Authorization', `Bearer ${guest1Token}`)
        .send({
          name: 'Hacker Hotel',
          address: 'Nowhere',
          city: 'Mumbai',
          manager_user_id: 'USR-002',
        });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('GUEST receives 403 on GET /api/v1/admin/rooms', async () => {
      const res = await request(app)
        .get('/api/v1/admin/rooms')
        .set('Authorization', `Bearer ${guest1Token}`);

      assert.equal(res.status, 403);
    });

    it('GUEST receives 403 on POST /api/v1/admin/rooms/ROOM-101/block', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms/ROOM-101/block')
        .set('Authorization', `Bearer ${guest1Token}`)
        .send({ start_date: '2032-05-01', end_date: '2032-05-05' });

      assert.equal(res.status, 403);
    });

    it('GUEST receives 403 on GET /api/v1/admin/room-types', async () => {
      const res = await request(app)
        .get('/api/v1/admin/room-types')
        .set('Authorization', `Bearer ${guest1Token}`);

      assert.equal(res.status, 403);
    });

    it('GUEST receives 403 on GET /api/v1/admin/coupons', async () => {
      const res = await request(app)
        .get('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${guest1Token}`);

      assert.equal(res.status, 403);
    });

    it('GUEST receives 403 on GET /api/v1/admin/reservations', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reservations')
        .set('Authorization', `Bearer ${guest1Token}`);

      assert.equal(res.status, 403);
    });

    it('GUEST receives 403 on GET /api/v1/admin/reports/kpi', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/kpi')
        .set('Authorization', `Bearer ${guest1Token}`);

      assert.equal(res.status, 403);
    });

    it('GUEST receives 403 on GET /api/v1/admin/audit-logs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${guest1Token}`);

      assert.equal(res.status, 403);
    });
  });

  // =========================================================================
  // 2. Cross-Manager Isolation (Manager 1 vs Manager 2)
  // =========================================================================
  describe("2. Cross-Manager Isolation: Manager 1 cannot see or edit Manager 2's resources", () => {
    it("Manager 1 receives 404 (anti-enumeration) when accessing Manager 2's property PROP-002", async () => {
      const res = await request(app)
        .get('/api/v1/admin/properties/PROP-002')
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it("Manager 1 receives 404 when attempting to edit Manager 2's property PROP-002", async () => {
      const res = await request(app)
        .patch('/api/v1/admin/properties/PROP-002')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({ name: 'Tampered Property Name' });

      assert.equal(res.status, 404);
    });

    it('Manager 1 listing properties receives only PROP-001, never PROP-002', async () => {
      const res = await request(app)
        .get('/api/v1/admin/properties')
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.properties));
      assert.ok(res.body.properties.every((p) => p.property_id === 'PROP-001'));
      assert.ok(!res.body.properties.some((p) => p.property_id === 'PROP-002'));
    });

    it("Manager 1 receives 404 when accessing Manager 2's room ROOM-301", async () => {
      const res = await request(app)
        .get('/api/v1/admin/rooms/ROOM-301')
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(res.status, 404);
    });

    it("Manager 1 receives 404 when attempting to edit Manager 2's room ROOM-301", async () => {
      const res = await request(app)
        .patch('/api/v1/admin/rooms/ROOM-301')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({ status: 'INACTIVE' });

      assert.equal(res.status, 404);
    });

    it("Manager 1 receives 404 when accessing Manager 2's reservation RES-004 (at PROP-002)", async () => {
      const res = await request(app)
        .get('/api/v1/admin/reservations/RES-004')
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(res.status, 404);
    });

    it('Manager 1 listing reservations only receives reservations for PROP-001', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reservations')
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.reservations));
      assert.ok(res.body.reservations.every((r) => r.property_id === 'PROP-001'));
      assert.ok(!res.body.reservations.some((r) => r.property_id === 'PROP-002'));
    });

    it('Property Manager cannot create a new property (Admin only -> 403)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/properties')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          name: 'Manager Hotel',
          address: 'Beach Rd',
          city: 'Goa',
          manager_user_id: 'USR-002',
        });

      assert.equal(res.status, 403);
    });

    it('Property Manager cannot delete a property (Admin only -> 403)', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/properties/PROP-001')
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(res.status, 403);
    });

    it('Manager 1 can successfully update their own property PROP-001', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/properties/PROP-001')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({ address: 'Updated Marine Drive' });

      assert.equal(res.status, 200);
      assert.equal(res.body.property.address, 'Updated Marine Drive');
    });

    it("Manager 2 receives 404 when accessing Manager 1's property PROP-001", async () => {
      const res = await request(app)
        .get('/api/v1/admin/properties/PROP-001')
        .set('Authorization', `Bearer ${manager2Token}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('Manager 2 can access their own property PROP-002', async () => {
      const res = await request(app)
        .get('/api/v1/admin/properties/PROP-002')
        .set('Authorization', `Bearer ${manager2Token}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.property.property_id, 'PROP-002');
    });
  });

  // =========================================================================
  // 3. 404 Anti-Enumeration on Guest Endpoints
  // =========================================================================
  describe('3. 404 Anti-Enumeration: Guest accessing another guest resource receives 404 (not 403)', () => {
    it("Guest 2 accessing Guest 1's reservation RES-001 receives 404 (not 403)", async () => {
      const res = await request(app)
        .get('/api/v1/reservations/RES-001')
        .set('Authorization', `Bearer ${guest2Token}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it("Guest 2 accessing Guest 1's payment PAY-001 receives 404 (not 403)", async () => {
      const res = await request(app)
        .get('/api/v1/payments/PAY-001')
        .set('Authorization', `Bearer ${guest2Token}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it("Guest 2 accessing Guest 1's refund REF-001 receives 404 (not 403)", async () => {
      const res = await request(app)
        .get('/api/v1/refunds/REF-001')
        .set('Authorization', `Bearer ${guest2Token}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });
  });

  // =========================================================================
  // 4. Room Availability Management: Block & Unblock Dates
  // =========================================================================
  describe('4. Room Availability Management: Block & Unblock Dates', () => {
    it('Manager 1 successfully blocks dates for ROOM-101 with reason BLOCKED', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms/ROOM-101/block')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          start_date: '2032-06-10',
          end_date: '2032-06-13',
          reason: 'Maintenance and painting',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.blocked_nights, 3);

      // Verify inventory documents were created with status BLOCKED and reason
      const inventoryDocs = await Inventory.find({
        room_id: 'ROOM-101',
        date: {
          $gte: new Date('2032-06-10T00:00:00Z'),
          $lt: new Date('2032-06-13T00:00:00Z'),
        },
      });

      assert.equal(inventoryDocs.length, 3);
      assert.ok(inventoryDocs.every((inv) => inv.status === 'BLOCKED'));
      assert.ok(inventoryDocs.every((inv) => inv.reason === 'Maintenance and painting'));
    });

    it('Manager 1 receives 409 Conflict when attempting to block nights that have a reservation', async () => {
      // Find an existing confirmed reservation for ROOM-101
      const existingRes = await Reservation.findOne({
        room_id: 'ROOM-101',
        status: { $in: ['CONFIRMED', 'PENDING'] },
      });

      assert.ok(existingRes, 'Existing reservation should exist in seed data');

      const checkInStr = new Date(existingRes.check_in_date).toISOString().split('T')[0];
      const checkOutStr = new Date(existingRes.check_out_date).toISOString().split('T')[0];

      const res = await request(app)
        .post('/api/v1/admin/rooms/ROOM-101/block')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          start_date: checkInStr,
          end_date: checkOutStr,
          reason: 'Emergency Renovation',
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'ROOM_HAS_RESERVATION');
    });

    it('Manager 1 successfully unblocks the blocked dates for ROOM-101', async () => {
      const res = await request(app)
        .post('/api/v1/admin/rooms/ROOM-101/unblock')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          start_date: '2032-06-10',
          end_date: '2032-06-13',
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.unblocked_count, 3);

      // Verify BLOCKED inventory documents were deleted
      const remainingDocs = await Inventory.find({
        room_id: 'ROOM-101',
        date: {
          $gte: new Date('2032-06-10T00:00:00Z'),
          $lt: new Date('2032-06-13T00:00:00Z'),
        },
        status: 'BLOCKED',
      });

      assert.equal(remainingDocs.length, 0);
    });
  });

  // =========================================================================
  // 5. Room Deactivation & Reservations Preservation
  // =========================================================================
  describe('5. Room Deactivation: Deactivating a room does not break existing confirmed reservations', () => {
    it('Deactivating a room (INACTIVE) updates room status without affecting existing confirmed reservations', async () => {
      // Find a confirmed reservation on ROOM-101
      const [reservationBefore, roomBefore] = await Promise.all([
        Reservation.findOne({ room_id: 'ROOM-101', status: 'CONFIRMED' }),
        Room.findOne({ room_id: 'ROOM-101' }),
      ]);
      assert.ok(reservationBefore, 'Confirmed reservation on ROOM-101 should exist');
      assert.ok(roomBefore, 'ROOM-101 should exist');

      // Deactivate ROOM-101
      const patchRes = await request(app)
        .patch('/api/v1/admin/rooms/ROOM-101')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({ status: 'INACTIVE' });

      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.room.status, 'INACTIVE');

      // Verify the confirmed reservation still exists and remains CONFIRMED
      const reservationAfter = await Reservation.findOne({
        reservation_id: reservationBefore.reservation_id,
      });

      assert.equal(reservationAfter.status, 'CONFIRMED');
      assert.equal(reservationAfter.room_id, 'ROOM-101');

      // Restore ROOM-101 to its original status AVAILABLE
      await request(app)
        .patch('/api/v1/admin/rooms/ROOM-101')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({ status: 'AVAILABLE' });
    });
  });

  // =========================================================================
  // 6. Seasonal Pricing Overlap Rejection
  // =========================================================================
  describe('6. Room Pricing: Seasonal periods reject overlapping periods for the same room type', () => {
    let createdPricingId = '';

    it('Successfully creates a seasonal pricing period for RTYP-001', async () => {
      const res = await request(app)
        .post('/api/v1/admin/room-pricing')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          room_type_id: 'RTYP-001',
          start_date: '2032-11-01',
          end_date: '2032-11-15',
          price_per_night: 550000,
          pricing_type: 'SEASONAL',
          status: 'ACTIVE',
        });

      assert.equal(res.status, 201);
      assert.ok(res.body.pricing.pricing_id);
      createdPricingId = res.body.pricing.pricing_id;
    });

    it('Rejects creating an overlapping seasonal pricing period for the same room type (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/room-pricing')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          room_type_id: 'RTYP-001',
          start_date: '2032-11-10',
          end_date: '2032-11-20', // Overlaps with 2032-11-01 to 2032-11-15
          price_per_night: 600000,
          pricing_type: 'SEASONAL',
          status: 'ACTIVE',
        });

      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SEASONAL_PRICING_OVERLAP');
    });

    it('Allows creating a non-overlapping seasonal pricing period (201 Created)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/room-pricing')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          room_type_id: 'RTYP-001',
          start_date: '2032-11-16', // Starts after 2032-11-15
          end_date: '2032-11-30',
          price_per_night: 650000,
          pricing_type: 'SEASONAL',
          status: 'ACTIVE',
        });

      assert.equal(res.status, 201);

      // Clean up the created pricing
      await RoomPricing.deleteOne({ pricing_id: res.body.pricing.pricing_id });
      if (createdPricingId) {
        await RoomPricing.deleteOne({ pricing_id: createdPricingId });
      }
    });
  });

  // =========================================================================
  // 7. Coupons CRUD & Manager Scoping
  // =========================================================================
  describe('7. Coupon Management & Scoping', () => {
    let createdCouponId = '';

    it('Manager 1 successfully creates a coupon for their managed property PROP-001', async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          code: 'ADMINTESTMUMBAI25',
          discount_type: 'PERCENTAGE',
          discount_value: 25,
          maximum_discount: 250000,
          minimum_booking_amount: 500000,
          usage_limit: 10,
          per_customer_limit: 1,
          valid_from: '2032-01-01',
          valid_until: '2032-12-31',
          applicable_property_id: 'PROP-001',
          status: 'ACTIVE',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.coupon.code, 'ADMINTESTMUMBAI25');
      createdCouponId = res.body.coupon.coupon_id;
    });

    it('Manager 1 receives 403 when trying to create a global coupon without applicable_property_id', async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          code: 'ADMINTESTGLOBAL',
          discount_type: 'FIXED',
          discount_value: 50000,
          maximum_discount: 50000,
          usage_limit: 10,
          valid_from: '2032-01-01',
          valid_until: '2032-12-31',
          // applicable_property_id missing
        });

      assert.equal(res.status, 403);
    });

    it("Manager 1 receives 404 when trying to create a coupon for Manager 2's property PROP-002", async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${manager1Token}`)
        .send({
          code: 'ADMINTESTGOA',
          discount_type: 'PERCENTAGE',
          discount_value: 15,
          maximum_discount: 100000,
          usage_limit: 10,
          valid_from: '2032-01-01',
          valid_until: '2032-12-31',
          applicable_property_id: 'PROP-002',
        });

      assert.equal(res.status, 404);
    });

    it('Admin can view all coupons, while Manager 1 only sees coupons for PROP-001', async () => {
      const [adminRes, m1Res] = await Promise.all([
        request(app).get('/api/v1/admin/coupons').set('Authorization', `Bearer ${adminToken}`),
        request(app).get('/api/v1/admin/coupons').set('Authorization', `Bearer ${manager1Token}`),
      ]);

      assert.equal(adminRes.status, 200);
      assert.equal(m1Res.status, 200);
      assert.ok(adminRes.body.count >= m1Res.body.count);
      assert.ok(m1Res.body.coupons.every((c) => c.applicable_property_id === 'PROP-001'));
    });

    it('Manager 1 can view their created coupon, while Manager 2 receives 404', async () => {
      const m1Get = await request(app)
        .get(`/api/v1/admin/coupons/${createdCouponId}`)
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(m1Get.status, 200);
      assert.equal(m1Get.body.coupon.code, 'ADMINTESTMUMBAI25');

      const m2Get = await request(app)
        .get(`/api/v1/admin/coupons/${createdCouponId}`)
        .set('Authorization', `Bearer ${manager2Token}`);

      assert.equal(m2Get.status, 404);
    });
  });

  // =========================================================================
  // 8. Reservation Listing & Search Filters
  // =========================================================================
  describe('8. Reservation Listing with Filters & Search', () => {
    it('Admin lists reservations with pagination and status filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reservations?status=CONFIRMED&page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.reservations));
      assert.ok(res.body.pagination);
      assert.ok(res.body.reservations.every((r) => r.status === 'CONFIRMED'));
      assert.ok(res.body.reservations.every((r) => r.guest !== undefined));
    });

    it('Searches reservations by guest name or email', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reservations?search=guest1@example.com')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.reservations.length > 0);
      assert.equal(res.body.reservations[0].guest.email, 'guest1@example.com');
    });

    it('Searches reservations by reservation number', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reservations?search=RES-24-0001')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.reservations.length > 0);
      assert.equal(res.body.reservations[0].reservation_number, 'RES-24-0001');
      assert.equal(res.body.reservations[0].reservation_id, 'RES-001');
    });
  });

  // =========================================================================
  // 9. Reports & KPI Dashboard Aggregation Pipelines
  // =========================================================================
  describe('9. Reports Aggregation Pipelines & KPI Dashboard', () => {
    it('GET /api/v1/admin/reports/occupancy returns occupancy statistics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/occupancy?start_date=2024-09-01&end_date=2024-10-01')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(typeof res.body.overall_occupancy_rate_percentage === 'number');
      assert.ok(Array.isArray(res.body.properties));
      assert.ok(res.body.properties.length > 0);
      assert.ok(res.body.properties[0].total_rooms > 0);
    });

    it('GET /api/v1/admin/reports/revenue aggregates revenue by day and month', async () => {
      const resDaily = await request(app)
        .get('/api/v1/admin/reports/revenue?group_by=day')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(resDaily.status, 200);
      assert.ok(typeof resDaily.body.total_revenue_paise === 'number');
      assert.ok(Array.isArray(resDaily.body.items));

      const resMonthly = await request(app)
        .get('/api/v1/admin/reports/revenue?group_by=month')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(resMonthly.status, 200);
      assert.equal(resMonthly.body.group_by, 'month');
    });

    it('GET /api/v1/admin/reports/bookings returns total bookings and cancellation rate', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/bookings')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(typeof res.body.total_bookings === 'number');
      assert.ok(typeof res.body.cancellation_rate_percentage === 'number');
      assert.ok(res.body.by_status);
    });

    it('GET /api/v1/admin/reports/coupons returns coupon redemptions and discounts', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/coupons')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(typeof res.body.total_redemptions === 'number');
      assert.ok(typeof res.body.total_discount_paise === 'number');
      assert.ok(Array.isArray(res.body.coupons));
    });

    it('GET /api/v1/admin/reports/kpi returns executive summary metrics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/reports/kpi')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(res.body.kpi);
      assert.ok(typeof res.body.kpi.total_properties === 'number');
      assert.ok(typeof res.body.kpi.total_rooms === 'number');
      assert.ok(typeof res.body.kpi.total_bookings === 'number');
      assert.ok(typeof res.body.kpi.total_revenue_paise === 'number');
      assert.ok(typeof res.body.kpi.net_revenue_paise === 'number');
    });

    it("Manager 1 KPI report is strictly scoped to Manager 1's properties", async () => {
      const [adminKpi, m1Kpi] = await Promise.all([
        request(app).get('/api/v1/admin/reports/kpi').set('Authorization', `Bearer ${adminToken}`),
        request(app)
          .get('/api/v1/admin/reports/kpi')
          .set('Authorization', `Bearer ${manager1Token}`),
      ]);

      assert.equal(adminKpi.status, 200);
      assert.equal(m1Kpi.status, 200);
      // Admin sees multiple properties, Manager 1 sees only 1 property (PROP-001)
      assert.equal(m1Kpi.body.kpi.total_properties, 1);
      assert.ok(adminKpi.body.kpi.total_properties >= m1Kpi.body.kpi.total_properties);
    });
  });

  // =========================================================================
  // 10. Audit Logs Scoping
  // =========================================================================
  describe('10. Audit Logs Scoping & Filtering', () => {
    it('Admin can view all audit logs across all properties', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?page=1&limit=50')
        .set('Authorization', `Bearer ${adminToken}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.audit_logs));
      assert.ok(res.body.pagination.total > 0);
    });

    it('Manager 1 only sees audit logs for their managed property PROP-001', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs?page=1&limit=50')
        .set('Authorization', `Bearer ${manager1Token}`);

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.audit_logs));

      // Check that none of the returned logs refer to PROP-002
      for (const log of res.body.audit_logs) {
        if (log.entity_type === 'PROPERTY') {
          assert.equal(log.entity_id, 'PROP-001');
        }
        if (log.metadata && log.metadata.property_id) {
          assert.equal(log.metadata.property_id, 'PROP-001');
        }
      }
    });
  });
});
