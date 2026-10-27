#!/usr/bin/env node

/**
 * ============================================================================
 * SECURITY, AUTHORIZATION & DEFENSIVE DESIGN TEST SUITE
 * ============================================================================
 * Validates zero-trust security postures:
 *   1. Tampered price, discount, tax, total, or service fee in booking body
 *   2. Tampered refund_amount or cancellation_fee in cancel body
 *   3. Expired coupon rejection
 *   4. Booking an inactive / maintenance room
 *   5. Exceeding room maximum capacity
 *   6. IDOR prevention on reservations (returns 404 Not Found, NEVER 403)
 *   7. IDOR prevention on payments (returns 404 Not Found, NEVER 403)
 *   8. IDOR prevention on refunds (returns 404 Not Found, NEVER 403)
 *   9. Role enforcement: Guest calling admin/manager endpoints (403 Forbidden)
 *  10. Multi-tenant property scoping: Manager 1 cannot access Manager 2 property
 *  11. State machine integrity: Invalid state transition (PENDING -> CHECKED_IN)
 *  12. State machine rule: Check-in on a cancelled reservation (409 Conflict)
 *  13. State machine rule: Cancelling a completed/checked-out stay (409 Conflict)
 * ============================================================================
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000/api/v1';

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

async function runSecurityTests() {
  const startTime = Date.now();
  console.log('\n🛡️  Starting Security & Authorization Integration Test Suite');
  console.log(`🎯 Target API Base URL: ${BASE_URL}`);

  try {
    // --------------------------------------------------------------------------
    // Authenticate Users
    // --------------------------------------------------------------------------
    console.log('\n🔐 Authenticating test actors...');
    const [guest1Token, guest2Token, manager1Token, manager2Token, adminToken] =
      await Promise.all([
        login('guest1@example.com'),
        login('guest2@example.com'),
        login('manager1@example.com'),
        login('manager2@example.com'),
        login('admin@example.com'),
      ]);
    console.log('   Authenticated: Guest 1, Guest 2, Manager 1 (Mumbai), Manager 2 (Goa), Admin');

    // ==========================================================================
    // TEST 1: Tampered Financial Fields in Reservation Creation
    // ==========================================================================
    logHeader('TEST 1: Tampered Financial Fields in Reservation Creation');
    console.log('   Client attempts to inject total_amount: 100, discount: 50000, price: 50...');
    const tamperRes = await api('/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2031-01-10',
        check_out_date: '2031-01-14',
        guests_count: 2,
        total_amount: 100,
        discount_amount: 50000,
        service_fee: 0,
        tax_amount: 0,
      },
    });

    const isTamperRejected = tamperRes.status === 400;
    recordResult(
      'Tampered price/discount/tax/total/service_fee in booking body strictly rejected with 400',
      isTamperRejected,
      `HTTP ${tamperRes.status}: ${tamperRes.data?.error?.message || 'Rejected'}`
    );

    // ==========================================================================
    // TEST 2: Tampered Refund Fields in Cancellation
    // ==========================================================================
    logHeader('TEST 2: Tampered Refund Fields in Cancellation');
    // Create a legitimate reservation first
    const legitResv = await api('/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2031-02-10',
        check_out_date: '2031-02-14',
        guests_count: 2,
      },
    });
    const testResvId = legitResv.data.reservation.reservation_id;

    console.log(`   Client attempts to pass refund_amount: 9999999 to cancellation on ${testResvId}...`);
    const tamperCancelRes = await api(`/reservations/${testResvId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        refund_amount: 9999999,
        cancellation_fee: 0,
        original_amount: 10000000,
      },
    });

    const isTamperCancelRejected = tamperCancelRes.status === 400;
    recordResult(
      'Tampered refund_amount/cancellation_fee in cancel body strictly rejected with 400',
      isTamperCancelRejected,
      `HTTP ${tamperCancelRes.status}`
    );

    // ==========================================================================
    // TEST 3: Expired Coupon Code
    // ==========================================================================
    logHeader('TEST 3: Expired Coupon Rejection');
    console.log('   Client attempts to apply expired coupon OLD10...');
    const expiredCouponRes = await api('/reservations/quote', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2031-03-10',
        check_out_date: '2031-03-14',
        guests_count: 2,
        coupon_code: 'OLD10',
      },
    });

    const isExpiredRejected =
      expiredCouponRes.status === 400 &&
      (expiredCouponRes.data?.error?.code === 'COUPON_EXPIRED' ||
        expiredCouponRes.data?.error?.message?.includes('expired'));
    recordResult(
      'Expired coupon code rejected with 400 Bad Request',
      isExpiredRejected,
      `HTTP ${expiredCouponRes.status}: ${expiredCouponRes.data?.error?.code}`
    );

    // ==========================================================================
    // TEST 4: Booking an Inactive / Maintenance Room
    // ==========================================================================
    logHeader('TEST 4: Booking an Inactive Room');
    // Set ROOM-201 to MAINTENANCE via admin
    console.log('   Deactivating ROOM-201 to MAINTENANCE status via admin...');
    await api('/admin/rooms/ROOM-201', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'MAINTENANCE' },
    });

    console.log('   Guest attempts to book inactive room ROOM-201...');
    const inactiveBookingRes = await api('/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-201',
        check_in_date: '2031-04-10',
        check_out_date: '2031-04-14',
        guests_count: 2,
      },
    });

    // Restore ROOM-201
    await api('/admin/rooms/ROOM-201', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: 'ACTIVE' },
    });

    const isInactiveRejected = inactiveBookingRes.status === 404 || inactiveBookingRes.status === 400;
    recordResult(
      'Booking an inactive / maintenance room rejected with 404/400',
      isInactiveRejected,
      `HTTP ${inactiveBookingRes.status}`
    );

    // ==========================================================================
    // TEST 5: Exceeding Room Capacity
    // ==========================================================================
    logHeader('TEST 5: Exceeding Room Maximum Capacity');
    console.log('   Attempting to book 2-guest room ROOM-101 with 10 guests...');
    const capacityRes = await api('/reservations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
      body: {
        property_id: 'PROP-001',
        room_id: 'ROOM-101',
        check_in_date: '2031-05-10',
        check_out_date: '2031-05-14',
        guests_count: 10,
      },
    });

    const isCapacityRejected =
      capacityRes.status === 400 &&
      (capacityRes.data?.error?.code === 'CAPACITY_EXCEEDED' ||
        capacityRes.data?.error?.message?.includes('capacity'));
    recordResult(
      'Exceeding room maximum capacity rejected with 400 Bad Request',
      isCapacityRejected,
      `HTTP ${capacityRes.status}`
    );

    // ==========================================================================
    // TEST 6: IDOR on Reservations (404 NOT 403)
    // ==========================================================================
    logHeader('TEST 6: IDOR Defense on Reservations');
    console.log('   Guest 2 attempts to query Guest 1 reservation RES-001...');
    const idorResv = await api('/reservations/RES-001', {
      headers: { Authorization: `Bearer ${guest2Token}` },
    });

    const isIdorResvSafe = idorResv.status === 404;
    recordResult(
      'IDOR defense: Guest 2 receives 404 (NOT 403) when requesting Guest 1 reservation',
      isIdorResvSafe,
      `HTTP ${idorResv.status}`
    );

    // ==========================================================================
    // TEST 7: IDOR on Payments (404 NOT 403)
    // ==========================================================================
    logHeader('TEST 7: IDOR Defense on Payments');
    console.log('   Guest 2 attempts to query Guest 1 payment PAY-001...');
    const idorPay = await api('/payments/PAY-001', {
      headers: { Authorization: `Bearer ${guest2Token}` },
    });

    const isIdorPaySafe = idorPay.status === 404;
    recordResult(
      'IDOR defense: Guest 2 receives 404 (NOT 403) when requesting Guest 1 payment',
      isIdorPaySafe,
      `HTTP ${idorPay.status}`
    );

    // ==========================================================================
    // TEST 8: IDOR on Refunds (404 NOT 403)
    // ==========================================================================
    logHeader('TEST 8: IDOR Defense on Refunds');
    console.log('   Guest 2 attempts to query Guest 1 refund REF-001...');
    const idorRef = await api('/refunds/REF-001', {
      headers: { Authorization: `Bearer ${guest2Token}` },
    });

    const isIdorRefSafe = idorRef.status === 404;
    recordResult(
      'IDOR defense: Guest 2 receives 404 (NOT 403) when requesting Guest 1 refund',
      isIdorRefSafe,
      `HTTP ${idorRef.status}`
    );

    // ==========================================================================
    // TEST 9: Role Enforcement: Guest Calling Admin Endpoints
    // ==========================================================================
    logHeader('TEST 9: Role Authorization: Guest Calling Admin Endpoints');
    const adminEndpoints = [
      { method: 'GET', path: '/admin/properties' },
      { method: 'POST', path: '/admin/properties', body: { name: 'Hack Hotel' } },
      { method: 'GET', path: '/admin/reports/kpi' },
      { method: 'GET', path: '/audit-logs' },
    ];

    let allAdminBlocked = true;
    for (const ep of adminEndpoints) {
      const res = await api(ep.path, {
        method: ep.method,
        headers: { Authorization: `Bearer ${guest1Token}` },
        body: ep.body,
      });
      if (res.status !== 403) {
        allAdminBlocked = false;
        console.log(`   Failed: Guest called ${ep.method} ${ep.path} and got HTTP ${res.status}`);
      }
    }

    recordResult(
      'Role Enforcement: Guest calling admin endpoints receives 403 Forbidden',
      allAdminBlocked,
      'Checked 4 admin endpoints'
    );

    // ==========================================================================
    // TEST 10: Multi-Tenant Property Scoping: Manager 1 vs Manager 2
    // ==========================================================================
    logHeader('TEST 10: Multi-Tenant Property Manager Scoping');
    console.log('   Manager 1 (Mumbai) attempts to access Manager 2 property PROP-002 (Goa)...');
    const crossPropRes = await api('/admin/properties/PROP-002', {
      headers: { Authorization: `Bearer ${manager1Token}` },
    });

    console.log('   Manager 1 attempts to modify Manager 2 room ROOM-301...');
    const crossRoomRes = await api('/admin/rooms/ROOM-301', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${manager1Token}` },
      body: { status: 'INACTIVE' },
    });

    const isManagerScoped = crossPropRes.status === 404 && crossRoomRes.status === 404;
    recordResult(
      'Multi-tenant scoping: Manager 1 receives 404 when querying/modifying Manager 2 property/rooms',
      isManagerScoped,
      `Property: ${crossPropRes.status}, Room: ${crossRoomRes.status}`
    );

    // ==========================================================================
    // TEST 11: Invalid State Transition: PENDING to CHECKED_IN
    // ==========================================================================
    logHeader('TEST 11: State Machine: Invalid State Transition (PENDING -> CHECKED_IN)');
    console.log(`   Attempting illegal transition PENDING -> CHECKED_IN on ${testResvId}...`);
    const invalidTransRes = await api(`/reservations/${testResvId}/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const isInvalidTransBlocked = invalidTransRes.status === 409;
    recordResult(
      'Invalid state transition (PENDING -> CHECKED_IN) strictly rejected with 409 Conflict',
      isInvalidTransBlocked,
      `HTTP ${invalidTransRes.status}`
    );

    // ==========================================================================
    // TEST 12: State Machine Rule: Check-in on a Cancelled Reservation
    // ==========================================================================
    logHeader('TEST 12: Rule: A Cancelled Reservation Can NEVER Be Checked In');
    // Cancel testResvId
    await api(`/reservations/${testResvId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${guest1Token}` },
    });

    console.log(`   Attempting check-in on cancelled reservation ${testResvId}...`);
    const cancelledCheckInRes = await api(`/reservations/${testResvId}/check-in`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const isCancelledCheckInBlocked = cancelledCheckInRes.status === 409;
    recordResult(
      'Rule: A cancelled reservation can NEVER be checked in (returns 409 Conflict)',
      isCancelledCheckInBlocked,
      `HTTP ${cancelledCheckInRes.status}`
    );

    // ==========================================================================
    // TEST 13: State Machine Rule: Cancelling a Completed / Checked-Out Stay
    // ==========================================================================
    logHeader('TEST 13: Rule: A Checked-Out Reservation Can NEVER Be Cancelled');
    // RES-003 is CHECKED_OUT in seed data
    console.log('   Attempting cancellation on already checked-out reservation RES-003...');
    const checkedOutCancelRes = await api('/reservations/RES-003/cancel', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    const isCheckedOutCancelBlocked = checkedOutCancelRes.status === 409;
    recordResult(
      'Rule: A checked-out reservation can NEVER be cancelled (returns 409 Conflict)',
      isCheckedOutCancelBlocked,
      `HTTP ${checkedOutCancelRes.status}`
    );

  } catch (err) {
    console.error('\n💥 Unexpected Exception during Security Test:', err);
    testsFailed++;
  }

  // --------------------------------------------------------------------------
  // SUMMARY REPORT
  // --------------------------------------------------------------------------
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n' + '='.repeat(76));
  console.log('  SECURITY & DEFENSIVE DESIGN TEST SUITE SUMMARY REPORT');
  console.log('='.repeat(76));
  results.forEach((r, idx) => {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`  ${String(idx + 1).padStart(2, ' ')}. ${icon} [${r.status}] ${r.name}`);
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

runSecurityTests();
