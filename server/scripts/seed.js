import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { toPaise } from '../src/utils/currency.js';
import { logger } from '../src/utils/logger.js';
import {
  User,
  Guest,
  Property,
  RoomType,
  Room,
  RoomPricing,
  Reservation,
  Coupon,
  CouponRedemption,
  Payment,
  Refund,
  AuditLog,
  Inventory,
} from '../src/models/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Locate mock_data.json with fallback paths
const findMockDataPath = () => {
  const candidatePaths = [
    path.resolve(__dirname, '../data/mock_data.json'),
    path.resolve(__dirname, '../../Task_9/mock_data.json'),
    path.resolve(process.cwd(), 'Task_9/mock_data.json'),
    path.resolve(process.cwd(), 'mock_data.json'),
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  throw new Error(
    `mock_data.json could not be found in candidate paths: ${candidatePaths.join(', ')}`
  );
};

export const seedDatabase = async () => {
  try {
    await connectDB();
    logger.info('🌱 Starting database seeding...');

    const dataPath = findMockDataPath();
    logger.info(`Loading mock data from: ${dataPath}`);
    const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

    // 1. Seed Users (Give every user password Password@123)
    const defaultPassword = 'Password@123';
    const passwordHash = await bcrypt.hash(defaultPassword, 10);

    const userOps = rawData.users.map((u) => ({
      updateOne: {
        filter: { user_id: u.user_id },
        update: {
          $set: {
            user_id: u.user_id,
            name: u.name,
            email: u.email.toLowerCase(),
            passwordHash,
            role: u.role,
            status: u.status,
          },
        },
        upsert: true,
      },
    }));
    await User.bulkWrite(userOps);
    logger.info(`Seeded ${userOps.length} users (password: ${defaultPassword})`);

    // 2. Seed Guests
    const guestOps = rawData.guests.map((g) => ({
      updateOne: {
        filter: { guest_id: g.guest_id },
        update: {
          $set: {
            guest_id: g.guest_id,
            user_id: g.user_id,
            guest_number: g.guest_number,
            name: g.name,
            email: g.email.toLowerCase(),
            phone: g.phone,
            address: g.address,
            status: g.status,
            created_at: new Date(g.created_at),
          },
        },
        upsert: true,
      },
    }));
    await Guest.bulkWrite(guestOps);
    logger.info(`Seeded ${guestOps.length} guests`);

    // 3. Seed Properties
    const propertyOps = rawData.properties.map((p) => ({
      updateOne: {
        filter: { property_id: p.property_id },
        update: {
          $set: {
            property_id: p.property_id,
            property_code: p.property_code,
            name: p.name,
            property_type: p.property_type,
            address: p.address,
            city: p.city,
            state: p.state,
            country: p.country,
            status: p.status,
            manager_user_id: p.manager_user_id,
            created_at: new Date(p.created_at),
          },
        },
        upsert: true,
      },
    }));
    await Property.bulkWrite(propertyOps);
    logger.info(`Seeded ${propertyOps.length} properties`);

    // 4. Seed Room Types (Store money as integer paise)
    const roomTypeOps = rawData.room_types.map((rt) => ({
      updateOne: {
        filter: { room_type_id: rt.room_type_id },
        update: {
          $set: {
            room_type_id: rt.room_type_id,
            property_id: rt.property_id,
            name: rt.name,
            description: rt.description,
            max_guests: rt.max_guests,
            base_price_per_night: toPaise(rt.base_price_per_night),
            status: rt.status,
          },
        },
        upsert: true,
      },
    }));
    await RoomType.bulkWrite(roomTypeOps);
    logger.info(`Seeded ${roomTypeOps.length} room types`);

    // 5. Seed Rooms
    const roomOps = rawData.rooms.map((r) => ({
      updateOne: {
        filter: { room_id: r.room_id },
        update: {
          $set: {
            room_id: r.room_id,
            property_id: r.property_id,
            room_type_id: r.room_type_id,
            room_number: r.room_number,
            floor: r.floor,
            max_guests: r.max_guests,
            status: r.status,
          },
        },
        upsert: true,
      },
    }));
    await Room.bulkWrite(roomOps);
    logger.info(`Seeded ${roomOps.length} rooms`);

    // 6. Seed Room Pricing (Store price_per_night in paise)
    const pricingOps = rawData.room_pricing.map((rp) => ({
      updateOne: {
        filter: { pricing_id: rp.pricing_id },
        update: {
          $set: {
            pricing_id: rp.pricing_id,
            room_type_id: rp.room_type_id,
            start_date: new Date(rp.start_date),
            end_date: new Date(rp.end_date),
            price_per_night: toPaise(rp.price_per_night),
            pricing_type: rp.pricing_type,
            status: rp.status,
          },
        },
        upsert: true,
      },
    }));
    await RoomPricing.bulkWrite(pricingOps);
    logger.info(`Seeded ${pricingOps.length} pricing rules`);

    // 7. Seed Reservations (Store all financial amounts in paise)
    const reservationOps = rawData.reservations.map((res) => ({
      updateOne: {
        filter: { reservation_id: res.reservation_id },
        update: {
          $set: {
            reservation_id: res.reservation_id,
            reservation_number: res.reservation_number,
            guest_id: res.guest_id,
            property_id: res.property_id,
            room_id: res.room_id,
            check_in_date: new Date(res.check_in_date),
            check_out_date: new Date(res.check_out_date),
            guests_count: res.guests_count,
            base_amount: toPaise(res.base_amount),
            discount_amount: toPaise(res.discount_amount),
            tax_amount: toPaise(res.tax_amount),
            service_fee: toPaise(res.service_fee),
            total_amount: toPaise(res.total_amount),
            status: res.status,
            cancellation_policy: res.cancellation_policy,
            created_at: new Date(res.created_at),
            updated_at: new Date(res.updated_at),
          },
        },
        upsert: true,
      },
    }));
    await Reservation.bulkWrite(reservationOps);
    logger.info(`Seeded ${reservationOps.length} reservations`);

    // 8. Seed Coupons:
    // Keep 2024-expired coupons as they are (for expired-coupon tests)
    // ADD several currently valid coupons:
    // a) percentage one
    // b) fixed one
    // c) property-specific one
    // d) customer-restricted one
    // e) one with usage_limit 2 for race testing
    const seedCoupons = rawData.coupons.map((c) => ({
      coupon_id: c.coupon_id,
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_type === 'FIXED' ? toPaise(c.discount_value) : c.discount_value,
      maximum_discount: toPaise(c.maximum_discount),
      minimum_booking_amount: toPaise(c.minimum_booking_amount),
      usage_limit: c.usage_limit,
      per_customer_limit: c.per_customer_limit,
      valid_from: new Date(c.valid_from),
      valid_until: new Date(c.valid_until),
      applicable_property_id: c.applicable_property_id,
      applicable_room_type_id: null,
      restricted_guest_id: null,
      status: c.status,
    }));

    const currentlyValidCoupons = [
      // 1. Currently valid Percentage Coupon
      {
        coupon_id: 'CPN-005',
        code: 'SUMMER15',
        discount_type: 'PERCENTAGE',
        discount_value: 15, // 15%
        maximum_discount: toPaise(3000), // ₹3000 max discount
        minimum_booking_amount: toPaise(5000), // ₹5000 min booking
        usage_limit: 200,
        per_customer_limit: 1,
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2027-12-31T23:59:59Z'),
        applicable_property_id: null,
        applicable_room_type_id: null,
        restricted_guest_id: null,
        status: 'ACTIVE',
      },
      // 2. Currently valid Fixed Coupon
      {
        coupon_id: 'CPN-006',
        code: 'FLAT2000',
        discount_type: 'FIXED',
        discount_value: toPaise(2000), // ₹2000 flat discount
        maximum_discount: toPaise(2000),
        minimum_booking_amount: toPaise(8000), // ₹8000 min booking
        usage_limit: 100,
        per_customer_limit: 1,
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2027-12-31T23:59:59Z'),
        applicable_property_id: null,
        applicable_room_type_id: null,
        restricted_guest_id: null,
        status: 'ACTIVE',
      },
      // 3. Currently valid Property-specific Coupon
      {
        coupon_id: 'CPN-007',
        code: 'GOA30',
        discount_type: 'PERCENTAGE',
        discount_value: 30, // 30% off
        maximum_discount: toPaise(10000), // ₹10,000 max discount
        minimum_booking_amount: toPaise(10000), // ₹10,000 min booking
        usage_limit: 50,
        per_customer_limit: 1,
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2027-12-31T23:59:59Z'),
        applicable_property_id: 'PROP-002', // Sunset Goa Resort only
        applicable_room_type_id: null,
        restricted_guest_id: null,
        status: 'ACTIVE',
      },
      // 4. Currently valid Customer-restricted Coupon
      {
        coupon_id: 'CPN-008',
        code: 'VIPGUEST',
        discount_type: 'FIXED',
        discount_value: toPaise(2500), // ₹2500 flat discount
        maximum_discount: toPaise(2500),
        minimum_booking_amount: toPaise(5000),
        usage_limit: 10,
        per_customer_limit: 1,
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2027-12-31T23:59:59Z'),
        applicable_property_id: null,
        applicable_room_type_id: null,
        restricted_guest_id: 'GST-001', // Restricted strictly to GST-001
        status: 'ACTIVE',
      },
      // 5. Coupon with usage_limit 2 for race testing
      {
        coupon_id: 'CPN-009',
        code: 'FLASH50',
        discount_type: 'PERCENTAGE',
        discount_value: 50, // 50% off
        maximum_discount: toPaise(5000),
        minimum_booking_amount: toPaise(5000),
        usage_limit: 2, // Race condition test target: exactly 2 redemptions permitted
        per_customer_limit: 1,
        valid_from: new Date('2026-01-01T00:00:00Z'),
        valid_until: new Date('2027-12-31T23:59:59Z'),
        applicable_property_id: null,
        applicable_room_type_id: null,
        restricted_guest_id: null,
        status: 'ACTIVE',
      },
    ];

    const allCoupons = [...seedCoupons, ...currentlyValidCoupons];
    const couponOps = allCoupons.map((c) => ({
      updateOne: {
        filter: { coupon_id: c.coupon_id },
        update: { $set: c },
        upsert: true,
      },
    }));
    await Coupon.bulkWrite(couponOps);
    logger.info(`Seeded ${allCoupons.length} coupons (4 original + 5 new test coupons)`);

    // 9. Seed Coupon Redemptions
    const redemptionOps = rawData.coupon_redemptions.map((cr) => ({
      updateOne: {
        filter: { redemption_id: cr.redemption_id },
        update: {
          $set: {
            redemption_id: cr.redemption_id,
            coupon_id: cr.coupon_id,
            reservation_id: cr.reservation_id,
            guest_id: cr.guest_id,
            discount_amount: toPaise(cr.discount_amount),
            redeemed_at: new Date(cr.redeemed_at),
            status: cr.status,
          },
        },
        upsert: true,
      },
    }));
    await CouponRedemption.bulkWrite(redemptionOps);
    logger.info(`Seeded ${redemptionOps.length} coupon redemptions`);

    // 10. Seed Payments
    const paymentOps = rawData.payments.map((p) => ({
      updateOne: {
        filter: { payment_id: p.payment_id },
        update: {
          $set: {
            payment_id: p.payment_id,
            payment_reference: p.payment_reference,
            reservation_id: p.reservation_id,
            guest_id: p.guest_id,
            amount: toPaise(p.amount),
            currency: p.currency,
            payment_method: p.payment_method,
            status: p.status,
            idempotency_key: p.idempotency_key,
            paid_at: p.paid_at ? new Date(p.paid_at) : null,
            created_at: new Date(p.created_at),
          },
        },
        upsert: true,
      },
    }));
    await Payment.bulkWrite(paymentOps);
    logger.info(`Seeded ${paymentOps.length} payments`);

    // 11. Seed Refunds
    const refundOps = rawData.refunds.map((r) => ({
      updateOne: {
        filter: { refund_id: r.refund_id },
        update: {
          $set: {
            refund_id: r.refund_id,
            refund_reference: r.refund_reference,
            reservation_id: r.reservation_id,
            payment_id: r.payment_id,
            guest_id: r.guest_id,
            original_amount: toPaise(r.original_amount),
            cancellation_fee: toPaise(r.cancellation_fee),
            refund_amount: toPaise(r.refund_amount),
            reason: r.reason,
            status: r.status,
            idempotency_key: r.idempotency_key,
            refunded_at: new Date(r.refunded_at),
          },
        },
        upsert: true,
      },
    }));
    await Refund.bulkWrite(refundOps);
    logger.info(`Seeded ${refundOps.length} refunds`);

    // 12. Seed Audit Logs
    const auditOps = rawData.audit_logs.map((al) => {
      const meta = { ...al.metadata };
      if (meta.amount !== undefined) meta.amount = toPaise(meta.amount);
      if (meta.refund_amount !== undefined) meta.refund_amount = toPaise(meta.refund_amount);

      return {
        updateOne: {
          filter: { audit_id: al.audit_id },
          update: {
            $set: {
              audit_id: al.audit_id,
              user_id: al.user_id,
              action: al.action,
              entity_type: al.entity_type,
              entity_id: al.entity_id,
              metadata: meta,
              created_at: new Date(al.created_at),
            },
          },
          upsert: true,
        },
      };
    });
    await AuditLog.bulkWrite(auditOps);
    logger.info(`Seeded ${auditOps.length} audit logs`);

    // 13. Seed Inventory Documents:
    // "Generate inventory documents for every non-cancelled seed reservation.
    // One document per {room_id, date} per booked night, with a UNIQUE compound index on {room_id, date}"
    // Helper to generate nights between check-in and check-out
    const inventoryOps = [];

    for (const res of rawData.reservations) {
      if (res.status === 'CANCELLED') {
        continue;
      }

      const checkIn = new Date(res.check_in_date);
      const checkOut = new Date(res.check_out_date);

      // Iterate day by day from check-in (inclusive) to check-out (exclusive)
      const current = new Date(
        Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate())
      );
      const end = new Date(
        Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate())
      );

      while (current < end) {
        const nightDate = new Date(current);
        const dateStr = nightDate.toISOString().split('T')[0];
        const inventoryId = `INV-${res.room_id}-${dateStr}`;

        inventoryOps.push({
          updateOne: {
            filter: { room_id: res.room_id, date: nightDate },
            update: {
              $set: {
                inventory_id: inventoryId,
                room_id: res.room_id,
                date: nightDate,
                reservation_id: res.reservation_id,
                status: 'BOOKED',
              },
            },
            upsert: true,
          },
        });

        current.setUTCDate(current.getUTCDate() + 1);
      }
    }

    if (inventoryOps.length > 0) {
      await Inventory.bulkWrite(inventoryOps);
    }
    logger.info(
      `Seeded ${inventoryOps.length} inventory documents for active/pending/checked-out reservations`
    );

    // 14. Report Collection Counts
    const counts = {
      Users: await User.countDocuments(),
      Guests: await Guest.countDocuments(),
      Properties: await Property.countDocuments(),
      RoomTypes: await RoomType.countDocuments(),
      Rooms: await Room.countDocuments(),
      RoomPricing: await RoomPricing.countDocuments(),
      Reservations: await Reservation.countDocuments(),
      Coupons: await Coupon.countDocuments(),
      CouponRedemptions: await CouponRedemption.countDocuments(),
      Payments: await Payment.countDocuments(),
      Refunds: await Refund.countDocuments(),
      AuditLogs: await AuditLog.countDocuments(),
      Inventory: await Inventory.countDocuments(),
    };

    console.log('\n================ DATABASE SEED SUMMARY ================');
    console.table(
      Object.entries(counts).map(([collection, count]) => ({
        Collection: collection,
        Documents: count,
      }))
    );
    console.log('=======================================================\n');

    logger.info('✅ Seeding completed successfully!');
    return counts;
  } catch (error) {
    logger.error({ err: error }, '❌ Error during database seeding');
    throw error;
  } finally {
    await disconnectDB();
  }
};

// Execute if run directly from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
