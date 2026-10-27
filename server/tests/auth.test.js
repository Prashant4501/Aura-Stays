import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';
import { connectDB, disconnectDB } from '../src/config/db.js';
import { User, Guest } from '../src/models/index.js';

describe('Authentication & Authorization Integration Tests', () => {
  let guestAccessToken = '';
  let guestRefreshTokenCookie = '';
  let adminAccessToken = '';

  before(async () => {
    await connectDB();
  });

  after(async () => {
    // Cleanup any created test users
    await User.deleteMany({
      email: { $in: ['newguest@example.com', 'maliciousadmin@example.com'] },
    });
    await Guest.deleteMany({
      email: { $in: ['newguest@example.com', 'maliciousadmin@example.com'] },
    });
    await disconnectDB();
  });

  // 1. Test Registration
  it('POST /api/v1/auth/register - successfully registers a GUEST user and creates guest profile', async () => {
    const payload = {
      name: 'New Test Guest',
      email: 'newguest@example.com',
      password: 'Password@123',
      phone: '+91-9988776655',
      address: '777 Test Avenue, Pune',
    };

    const res = await request(app).post('/api/v1/auth/register').send(payload).expect(201);

    assert.ok(res.body.accessToken, 'Should return accessToken');
    assert.ok(res.body.user, 'Should return user object');
    assert.equal(res.body.user.role, 'GUEST', 'Role must strictly be GUEST');
    assert.equal(res.body.user.email, 'newguest@example.com');
    assert.match(res.body.user.user_id, /^USR-\d+$/, 'user_id must match USR-xxx format');
    assert.match(res.body.user.guest_id, /^GST-\d+$/, 'guest_id must match GST-xxx format');
    assert.match(
      res.body.user.guest_number,
      /^GST-\d+$/,
      'guest_number must match GST-xxxxx format'
    );

    // Verify httpOnly cookie for refresh token
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies, 'Must set response cookie');
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(refreshCookie, 'Must set refreshToken cookie');
    assert.ok(refreshCookie.includes('HttpOnly'), 'refreshToken cookie must be HttpOnly');

    // Verify DB state
    const createdUser = await User.findOne({ email: 'newguest@example.com' });
    assert.ok(createdUser);
    assert.equal(createdUser.role, 'GUEST');

    const createdGuest = await Guest.findOne({ email: 'newguest@example.com' });
    assert.ok(createdGuest);
    assert.equal(createdGuest.user_id, createdUser.user_id);
    assert.equal(createdGuest.phone, '+91-9988776655');
  });

  // 2. Test Blocking Self-Registration as ADMIN
  it('POST /api/v1/auth/register - rejects attempt to self-register as ADMIN', async () => {
    const maliciousPayload = {
      name: 'Hacker Admin',
      email: 'maliciousadmin@example.com',
      password: 'Password@123',
      phone: '+91-9988776644',
      role: 'ADMIN',
    };

    const res = await request(app).post('/api/v1/auth/register').send(maliciousPayload).expect(400);

    assert.ok(res.body.error, 'Must return consistent error structure');
    assert.equal(res.body.error.code, 'FORBIDDEN_ROLE_REGISTRATION');
    assert.match(
      res.body.error.message,
      /Self-registration as ADMIN or PROPERTY_MANAGER is strictly forbidden/
    );

    // Verify user was NOT created in DB
    const userInDb = await User.findOne({ email: 'maliciousadmin@example.com' });
    assert.equal(userInDb, null, 'User must not be created');
  });

  // 3. Test Login with Valid Credentials
  it('POST /api/v1/auth/login - logs in successfully with valid credentials', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'guest1@example.com',
        password: 'Password@123',
      })
      .expect(200);

    assert.ok(res.body.accessToken);
    assert.equal(res.body.user.email, 'guest1@example.com');
    assert.equal(res.body.user.role, 'GUEST');
    assert.equal(res.body.user.guest_id, 'GST-001');

    guestAccessToken = res.body.accessToken;

    const cookies = res.headers['set-cookie'];
    const refreshCookie = cookies.find((c) => c.startsWith('refreshToken='));
    assert.ok(refreshCookie);
    guestRefreshTokenCookie = refreshCookie.split(';')[0];
  });

  // 4. Test Login with Wrong Password
  it('POST /api/v1/auth/login - rejects login with wrong password (401)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'guest1@example.com',
        password: 'WrongPassword@999',
      })
      .expect(401);

    assert.ok(res.body.error);
    assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
    assert.equal(res.body.error.message, 'Invalid email or password');
    assert.equal(res.body.accessToken, undefined, 'No token should be issued');
  });

  // 5. Test Accessing Protected Route Without Token
  it('GET /api/v1/auth/me - rejects request without token (401)', async () => {
    const res = await request(app).get('/api/v1/auth/me').expect(401);

    assert.ok(res.body.error);
    assert.equal(res.body.error.code, 'UNAUTHORIZED');
    assert.match(res.body.error.message, /Authentication token is required/);
  });

  // 6. Test Accessing Protected Route With Token
  it('GET /api/v1/auth/me - returns user profile with valid Bearer token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .expect(200);

    assert.ok(res.body.user);
    assert.equal(res.body.user.email, 'guest1@example.com');
    assert.equal(res.body.user.guest_id, 'GST-001');
    assert.ok(res.body.guest);
    assert.equal(res.body.guest.guest_id, 'GST-001');
  });

  // 7. Role Enforcement: GUEST attempting to access ADMIN route
  it('GET /api/v1/admin/overview - GUEST receives 403 Forbidden on ADMIN-only route', async () => {
    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .expect(403);

    assert.ok(res.body.error);
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(res.body.error.message, 'Access denied: insufficient permissions');
  });

  // 8. Role Enforcement: ADMIN successfully accesses ADMIN route
  it('GET /api/v1/admin/overview - ADMIN successfully accesses ADMIN route', async () => {
    // Login as Admin
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'admin@example.com',
        password: 'Password@123',
      })
      .expect(200);

    adminAccessToken = loginRes.body.accessToken;

    const res = await request(app)
      .get('/api/v1/admin/overview')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    assert.equal(res.body.message, 'Welcome Admin');
    assert.equal(res.body.user.role, 'ADMIN');
  });

  // 9. Role Enforcement & Scoping: Guest accessing own vs another guest's reservation
  // RULE: Return 404 (not 403) when a guest requests a resource owned by someone else
  it('GET /api/v1/reservations/:id - Guest 1 accesses own reservation RES-001 (200 OK)', async () => {
    const res = await request(app)
      .get('/api/v1/reservations/RES-001')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .expect(200);

    assert.ok(res.body.reservation);
    assert.equal(res.body.reservation.reservation_id, 'RES-001');
    assert.equal(res.body.reservation.guest_id, 'GST-001');
  });

  it('GET /api/v1/reservations/:id - Guest 1 receives 404 (NOT 403) when requesting Guest 2 reservation RES-002', async () => {
    const res = await request(app)
      .get('/api/v1/reservations/RES-002')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .expect(404);

    assert.ok(res.body.error);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.equal(res.body.error.message, 'Reservation not found');
  });

  it('GET /api/v1/reservations/:id - Admin can access any reservation (200 OK)', async () => {
    const res = await request(app)
      .get('/api/v1/reservations/RES-002')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    assert.ok(res.body.reservation);
    assert.equal(res.body.reservation.reservation_id, 'RES-002');
  });

  // 10. Refresh Token
  it('POST /api/v1/auth/refresh - successfully issues a new access token using httpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [guestRefreshTokenCookie])
      .expect(200);

    assert.ok(res.body.accessToken);
    assert.notEqual(res.body.accessToken, '');
  });

  it('POST /api/v1/auth/refresh - rejects refresh request without cookie (401)', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').expect(401);

    assert.equal(res.body.error.code, 'REFRESH_TOKEN_REQUIRED');
  });

  // 11. Guest Profile Management (GET & PATCH /api/v1/guests/me)
  it('GET /api/v1/guests/me - returns current guest profile', async () => {
    const res = await request(app)
      .get('/api/v1/guests/me')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .expect(200);

    assert.ok(res.body.guest);
    assert.equal(res.body.guest.guest_id, 'GST-001');
    assert.equal(res.body.guest.email, 'guest1@example.com');
  });

  it('PATCH /api/v1/guests/me - updates profile and ignores unauthorized identity fields in body', async () => {
    const res = await request(app)
      .patch('/api/v1/guests/me')
      .set('Authorization', `Bearer ${guestAccessToken}`)
      .send({
        phone: '+91-9999988888',
        address: '999 Updated Palm Boulevard, Mumbai',
        // Malicious attempts to overwrite identity
        guest_id: 'GST-999',
        user_id: 'USR-999',
        email: 'hacked@example.com',
        role: 'ADMIN',
      })
      .expect(200);

    assert.equal(res.body.guest.phone, '+91-9999988888');
    assert.equal(res.body.guest.address, '999 Updated Palm Boulevard, Mumbai');
    // Ensure identity remained completely untouched
    assert.equal(res.body.guest.guest_id, 'GST-001', 'guest_id must not be modified');
    assert.equal(res.body.guest.user_id, 'USR-004', 'user_id must not be modified');
    assert.equal(res.body.guest.email, 'guest1@example.com', 'email must not be modified');
  });

  // 12. Logout
  it('POST /api/v1/auth/logout - successfully clears refresh cookie', async () => {
    const res = await request(app).post('/api/v1/auth/logout').expect(200);

    assert.equal(res.body.message, 'Logged out successfully');
    const cookies = res.headers['set-cookie'];
    assert.ok(cookies);
    const clearCookie = cookies.find((c) => c.startsWith('refreshToken=;'));
    assert.ok(clearCookie, 'Must clear refreshToken cookie');
  });
});
