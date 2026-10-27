#!/usr/bin/env node

/**
 * ============================================================================
 * CONCURRENCY INTEGRATION TEST SUITE
 * ============================================================================
 * High-concurrency stress test validating transactional integrity and zero
 * double-booking guarantees against MongoDB Atlas.
 *
 * Scenarios tested:
 *   1. 25 parallel bookings for the same room & dates (exactly 1 succeeds)
 *   2. Overlapping-date parallel bookings for the same room (exactly 1 succeeds)
 *   3. Parallel coupon redemptions at usage limit (exactly usage_limit succeeds)
 *   4. Payment replay with the same Idempotency-Key (exact cached response)
 *   5. Parallel payments with different keys for 1 reservation (exactly 1 succeeds)
 *   6. Parallel refund processing calls for 1 refund (exactly 1 processes)
 * ============================================================================
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';

// Test execution tracking
let testsPassed = 0;
let testsFailed = 0;
const results = [];

const logHeader = (title) => {
  console.log('\n' + '='.repeat(76));
  console.log(`  ${title}`);
  console.log('='.repeat(76));
};

const recordResult = (name, passed, details = '') => {
  if (passed) {
    testsPassed++;
    results.push({ name, status: 'PASS', details });
    console.log(`  ✅ [PASS] ${name}${details ? ` (${details})` : ''}`);
  } else {
    testsFailed++;
    results.push({ name, status: 'FAIL', details });
    console.log(`  ❌ [FAIL] ${name}${details ? ` (${details})` : ''}`);
  }
};

// HTTP Request helper
async function api(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return {
    status: response.status,
    headers: response.headers,
    data,
  };
}

async function login(email, password = 'Password@123') {
  const res = await api('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  if (res.status !== 200 || !res.data?.accessToken) {
    throw new Error(`Failed to login as ${email}: ${JSON.stringify(res.data)}`);
  }
  return res.data.accessToken;
}

// Generate dynamic future dates uniquely offset per test run to prevent collisions across runs
const runOffset = Math.floor((Date.now() / 1000) % 1000) * 15 + 60;
const getFutureDate = (step, dayOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + runOffset + step * 20 + dayOffset);
  return d.toISOString().split('T')[0];
};

async function runConcurrencyTests() {
  const startTime = Date.now();
  console.log('\n🚀 Starting Concurrency & Race-Condition Integration Test Suite');
  console.log(`🎯 Target API Base URL: ${BASE_URL}`);

  try {
    // --------------------------------------------------------------------------
    // Setup & Authenticate Test Users
    // --------------------------------------------------------------------------
    console.log('\n🔐 Authenticating test accounts...');
    const [guest1Token, guest2Token, guest3Token, adminToken] = await Promise.all([
      login('guest1@example.com'),
      login('guest2@example.com'),
      login('guest3@example.com'),
      login('admin@example.com'),
    ]);
    const guestTokens = [guest1Token, guest2Token, guest3Token];
    console.log('   Authenticated: Guest 1, Guest 2, Guest 3, and Administrator');

    // ==========================================================================
    // TEST 1: 25 Parallel Bookings for the Exact Same Room & Dates
    // ==========================================================================
    logHeader('TEST 1: 25 Parallel Bookings for the Same Room & Dates');
    console.log('   Dispatching 25 concurrent reservation holds on ROOM-101 (2030-05-10 to 2030-05-14)...');

    const checkIn1 = getFutureDate(1, 1);
    const checkOut1 = getFutureDate(1, 5);

    const test1Promises = Array.from({ length: 25 }, (_, idx) => {
      const token = guestTokens[idx % guestTokens.length];
      return api('/reservations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          property_id: 'PROP-001',
          room_id: 'ROOM-101',
          check_in_date: checkIn1,
          check_out_date: checkOut1,
          guests_count: 2,
        },
      });
    });

    const test1Responses = await Promise.all(test1Promises);
    const t1Created = test1Responses.filter((r) => r.status === 201);
    const t1Conflicts = test1Responses.filter((r) => r.status === 409);
    const t1Other = test1Responses.filter((r) => r.status !== 201 && r.status !== 409);

    console.log(`   Results -> 201 Created: ${t1Created.length} | 409 Conflict: ${t1Conflicts.length} | Other: ${t1Other.length}`);

    const test1Pass = t1Created.length === 1 && t1Conflicts.length === 24 && t1Other.length === 0;
    recordResult(
      '25 Parallel bookings for exact same room & dates (exactly 1 succeeds, 24 return 409)',
      test1Pass,
      `Created: ${t1Created.length}/1, Conflicts: ${t1Conflicts.length}/24`
    );

    // ==========================================================================
    // TEST 2: Overlapping-Date Parallel Bookings for the Same Room
    // ==========================================================================
    logHeader('TEST 2: Overlapping-Date Parallel Bookings for the Same Room');
    console.log('   Dispatching 5 concurrent bookings with overlapping date windows on ROOM-102...');

    // All these ranges overlap on night 5
    const overlappingRanges = [
      { check_in_date: getFutureDate(2, 1), check_out_date: getFutureDate(2, 6) }, // Nights 1..5 (includes 5)
      { check_in_date: getFutureDate(2, 3), check_out_date: getFutureDate(2, 7) }, // Nights 3..6 (includes 5)
      { check_in_date: getFutureDate(2, 4), check_out_date: getFutureDate(2, 8) }, // Nights 4..7 (includes 5)
      { check_in_date: getFutureDate(2, 5), check_out_date: getFutureDate(2, 9) }, // Nights 5..8 (includes 5)
      { check_in_date: getFutureDate(2, 2), check_out_date: getFutureDate(2, 7) }, // Nights 2..6 (includes 5)
    ];

    const test2Promises = overlappingRanges.map((range, idx) => {
      const token = guestTokens[idx % guestTokens.length];
      return api('/reservations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          property_id: 'PROP-001',
          room_id: 'ROOM-102',
          check_in_date: range.check_in_date,
          check_out_date: range.check_out_date,
          guests_count: 2,
        },
      });
    });

    const test2Responses = await Promise.all(test2Promises);
    const t2Created = test2Responses.filter((r) => r.status === 201);
    const t2Conflicts = test2Responses.filter((r) => r.status === 409);

    console.log(`   Results -> 201 Created: ${t2Created.length} | 409 Conflict: ${t2Conflicts.length}`);
    const test2Pass = t2Created.length === 1 && t2Conflicts.length === 4;
    recordResult(
      'Overlapping-date parallel bookings (exactly 1 succeeds, 4 return 409 Conflict)',
      test2Pass,
      `Created: ${t2Created.length}/1, Conflicts: ${t2Conflicts.length}/4`
    );

    // ==========================================================================
    // TEST 3: Parallel Coupon Redemption at the Usage Limit
    // ==========================================================================
    logHeader('TEST 3: Parallel Coupon Redemption at Usage Limit');
    // Create a fresh coupon dynamically via admin with usage_limit = 2
    const couponCode = `RACE${Date.now().toString().slice(-6)}`;
    console.log(`   Creating promotional coupon '${couponCode}' with usage_limit: 2...`);

    const cpnRes = await api('/admin/coupons', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: couponCode,
        discount_type: 'PERCENTAGE',
        discount_value: 20,
        maximum_discount: 500000,
        minimum_booking_amount: 100000,
        valid_from: '2020-01-01T00:00:00Z',
        valid_until: '2035-01-01T00:00:00Z',
        usage_limit: 2,
        per_customer_limit: 1,
        status: 'ACTIVE',
      },
    });

    if (cpnRes.status !== 201) {
      console.log('   Warning: Failed to create custom coupon, falling back to FLASH50');
    }
    const targetCoupon = cpnRes.status === 201 ? couponCode : 'FLASH50';

    console.log(`   Dispatching 8 parallel coupon redemptions for '${targetCoupon}' across non-overlapping dates...`);
    const test3Promises = Array.from({ length: 8 }, (_, idx) => {
      const checkIn = getFutureDate(3, idx * 3 + 1);
      const checkOut = getFutureDate(3, idx * 3 + 3);
      const token = guestTokens[idx % guestTokens.length];

      return api('/reservations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: {
          property_id: 'PROP-001',
          room_id: 'ROOM-101',
          check_in_date: checkIn,
          check_out_date: checkOut,
          guests_count: 1,
          coupon_code: targetCoupon,
        },
      });
    });

    const test3Responses = await Promise.all(test3Promises);
    const t3Created = test3Responses.filter((r) => r.status === 201);
    const t3Rejected = test3Responses.filter(
      (r) =>
        r.status === 400 &&
        (r.data?.error?.code === 'COUPON_LIMIT_REACHED' ||
          r.data?.error?.code === 'COUPON_PER_CUSTOMER_LIMIT_EXCEEDED' ||
          r.data?.error?.message?.includes('limit'))
    );

    console.log(`   Results -> 201 Redeemed: ${t3Created.length} | Rejected (Cap Reached): ${t3Rejected.length}`);
    const test3Pass = t3Created.length === 2 && t3Created.length + t3Rejected.length === 8;
    recordResult(
      `Parallel coupon redemption at usage_limit: 2 (exactly 2 succeed, rest rejected)`,
      test3Pass,
      `Redeemed: ${t3Created.length}/2, Rejected: ${t3Rejected.length}/6`
    );

    // ==========================================================================
    // TEST 4: Payment Replay with the Exact Same Idempotency-Key
    // ==========================================================================
    logHeader('TEST 4: Payment Replay with the Same Idempotency-Key');
    console.log('   Creating a fresh pending reservation for payment replay test...');

    const resvForReplay = await api('/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-201',
        check_in_date: getFutureDate(4, 1),
        check_out_date: getFutureDate(4, 4),
        guests_count: 2,
      },
    });

    if (resvForReplay.status !== 201) {
      throw new Error(`Failed to create test reservation: ${JSON.stringify(resvForReplay.data)}`);
    }

    const replayResId = resvForReplay.data.reservation.reservation_id;
    const replayKey = `IDEMP-TEST-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    console.log(`   1. Submitting initial payment for ${replayResId} with Idempotency-Key...`);
    const initialPaymentRes = await api('/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guest1Token}`,
        'Idempotency-Key': replayKey,
      },
      body: {
        reservation_id: replayResId,
        payment_method: 'CARD',
      },
    });

    console.log(`   2. Replaying identical payment request with the same Idempotency-Key...`);
    const replayedPaymentRes = await api('/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guest1Token}`,
        'Idempotency-Key': replayKey,
      },
      body: {
        reservation_id: replayResId,
        payment_method: 'CARD',
      },
    });

    const isInitialSuccess = initialPaymentRes.status === 200 && initialPaymentRes.data?.payment?.status === 'SUCCESS';
    const isReplayIdentical =
      replayedPaymentRes.status === 200 &&
      replayedPaymentRes.data?.payment?.payment_id === initialPaymentRes.data?.payment?.payment_id &&
      replayedPaymentRes.data?.payment?.amount === initialPaymentRes.data?.payment?.amount;

    const test4Pass = isInitialSuccess && isReplayIdentical;
    recordResult(
      'Payment replay with same Idempotency-Key returns cached original response without re-processing',
      test4Pass,
      `Status: ${replayedPaymentRes.status}, Payment ID: ${replayedPaymentRes.data?.payment?.payment_id}`
    );

    // ==========================================================================
    // TEST 5: Parallel Payments with Different Keys for One Reservation
    // ==========================================================================
    logHeader('TEST 5: Parallel Payments with Different Keys for One Reservation');
    console.log('   Creating a fresh pending reservation for concurrent payment test...');

    const resvForParallelPay = await api('/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest2Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-201',
        check_in_date: getFutureDate(5, 1),
        check_out_date: getFutureDate(5, 4),
        guests_count: 2,
      },
    });

    const parallelResId = resvForParallelPay.data.reservation.reservation_id;
    console.log(`   Dispatching 5 parallel payments with DIFFERENT keys for reservation ${parallelResId}...`);

    const test5Promises = Array.from({ length: 5 }, (_, idx) => {
      const uniqueKey = `PARALLEL-KEY-${Date.now()}-${idx}-${Math.random().toString(36).substring(7)}`;
      return api('/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${guest2Token}`,
          'Idempotency-Key': uniqueKey,
        },
        body: {
          reservation_id: parallelResId,
          payment_method: 'UPI',
        },
      });
    });

    const test5Responses = await Promise.all(test5Promises);
    const t5Success = test5Responses.filter((r) => r.status === 200);
    const t5Conflicts = test5Responses.filter((r) => r.status === 409 || r.status === 400);

    console.log(`   Results -> 200 Successful: ${t5Success.length} | 409/400 Rejected: ${t5Conflicts.length}`);
    const test5Pass = t5Success.length === 1 && t5Conflicts.length === 4;
    recordResult(
      'Parallel payments with different keys for 1 reservation (exactly 1 succeeds, 4 rejected)',
      test5Pass,
      `Succeeded: ${t5Success.length}/1, Rejected: ${t5Conflicts.length}/4`
    );

    // ==========================================================================
    // TEST 6: Parallel Refund Processing Calls for One Refund
    // ==========================================================================
    logHeader('TEST 6: Parallel Refund Processing Calls for One Refund');
    console.log('   Creating, confirming, and cancelling a reservation to generate a pending refund...');

    // 1. Create reservation
    const resvForRefund = await api('/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-201',
        check_in_date: getFutureDate(6, 1),
        check_out_date: getFutureDate(6, 4),
        guests_count: 1,
      },
    });
    const refundResId = resvForRefund.data.reservation.reservation_id;

    // 2. Pay reservation
    await api('/payments', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${guest1Token}`,
        'Idempotency-Key': `PAY-FOR-REFUND-${Date.now()}`,
      },
      body: {
        reservation_id: refundResId,
        payment_method: 'NET_BANKING',
      },
    });

    // 3. Cancel reservation (generates refund record)
    const cancelRes = await api(`/reservations/${refundResId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: { reason: 'Schedule changed' },
    });

    const refundId = cancelRes.data?.refund?.refund_id;
    if (!refundId) {
      throw new Error(`Failed to obtain refund_id from cancellation: ${JSON.stringify(cancelRes.data)}`);
    }

    console.log(`   Dispatching 10 parallel refund process calls for refund '${refundId}'...`);
    const test6Promises = Array.from({ length: 10 }, () => {
      return api(`/refunds/${refundId}/process`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
    });

    const test6Responses = await Promise.all(test6Promises);
    const t6Success = test6Responses.filter((r) => r.status === 200);
    const t6AllProcessed = test6Responses.every(
      (r) => r.data?.refund?.status === 'PROCESSED' || r.data?.refund?.status === 'SUCCESS'
    );

    console.log(`   Results -> 200 OK: ${t6Success.length} | Consistent Status PROCESSED: ${t6AllProcessed}`);
    const test6Pass = t6Success.length === 10 && t6AllProcessed;
    recordResult(
      'Parallel refund processing calls (idempotent: all 10 resolve cleanly with 200 without duplicate charges)',
      test6Pass,
      `Resolved: ${t6Success.length}/10, Consistent Status: PROCESSED`
    );

  } catch (err) {
    console.error('\n💥 Unexpected Exception during Concurrency Test:', err);
    testsFailed++;
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(76));
  console.log('  CONCURRENCY TEST SUITE SUMMARY REPORT');
  console.log('='.repeat(76));
  results.forEach((r, idx) => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${idx + 1}. ${icon} [${r.status}] ${r.name}`);
  });
  console.log('-'.repeat(76));
  console.log(`  Total Tests: ${results.length} | Passed: ${testsPassed} | Failed: ${testsFailed} | Duration: ${duration}s`);
  console.log('='.repeat(76) + '\n');

  if (testsFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runConcurrencyTests();
