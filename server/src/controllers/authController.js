import bcrypt from 'bcrypt';
import { z } from 'zod';
import { User, Guest, AuditLog } from '../models/index.js';
import { getNextBusinessId, getNextGuestNumber } from '../utils/idGenerator.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from '../utils/jwt.js';
import { BadRequestError, UnauthorizedError, ConflictError } from '../errors/AppError.js';

// Registration input validation schema
export const registerSchema = z
  .object({
    name: z.string().trim().optional(),
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    email: z.string().trim().email('Invalid email address').toLowerCase(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    phone: z.string().trim().min(7, 'Phone number must be at least 7 characters'),
    address: z.string().trim().optional().default(''),
    // Explicitly inspect role if client attempts to pass it
    role: z.string().optional(),
  })
  .refine(
    (data) =>
      (data.name && data.name.length >= 2) ||
      (data.first_name && data.first_name.length >= 1),
    {
      message: 'Full name or first name is required',
      path: ['name'],
    }
  );

// Login input validation schema
export const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

/**
 * Register a new GUEST.
 * RULE: Only GUEST registration is allowed.
 * Self-registration as ADMIN or PROPERTY_MANAGER is strictly blocked.
 */
export const register = async (req, res, next) => {
  try {
    const rawRole = req.body.role;
    // Strictly block any attempt to register with elevated roles
    if (
      rawRole &&
      (rawRole.toUpperCase() === 'ADMIN' || rawRole.toUpperCase() === 'PROPERTY_MANAGER')
    ) {
      throw new BadRequestError(
        'Self-registration as ADMIN or PROPERTY_MANAGER is strictly forbidden',
        null,
        'FORBIDDEN_ROLE_REGISTRATION'
      );
    }

    const { email, password, phone, address } = req.body;
    const name = (
      req.body.name || `${req.body.first_name || ''} ${req.body.last_name || ''}`
    ).trim();

    // Check if email already in use
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ConflictError('An account with this email already exists');
    }

    // Generate unique sequential business IDs
    const userId = await getNextBusinessId(User, 'user_id', 'USR-', 3);
    const guestId = await getNextBusinessId(Guest, 'guest_id', 'GST-', 3);
    const guestNumber = await getNextGuestNumber(Guest);

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // 1. Create User (Identity is ALWAYS forced to GUEST)
    const user = await User.create({
      user_id: userId,
      name,
      email,
      passwordHash,
      role: 'GUEST',
      status: 'ACTIVE',
    });

    // 2. Create linked Guest profile
    const guest = await Guest.create({
      guest_id: guestId,
      user_id: user.user_id,
      guest_number: guestNumber,
      name,
      email,
      phone,
      address,
      status: 'ACTIVE',
    });

    // 3. Create Audit Log
    const auditId = await getNextBusinessId(AuditLog, 'audit_id', 'AUD-', 3);
    await AuditLog.create({
      audit_id: auditId,
      user_id: user.user_id,
      action: 'USER_REGISTERED',
      entity_type: 'USER',
      entity_id: user.user_id,
      metadata: { role: 'GUEST', guest_id: guest.guest_id },
    });

    // Issue tokens
    const tokenPayload = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      guest_id: guest.guest_id,
    };
    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({ user_id: user.user_id });

    // Set refresh token in httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    return res.status(201).json({
      message: 'User and guest profile registered successfully',
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        guest_id: guest.guest_id,
        guest_number: guest.guest_number,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user.
 * Validates credentials and returns short-lived access token + sets refresh token in cookie.
 */
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('Invalid email or password', null, 'INVALID_CREDENTIALS');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password', null, 'INVALID_CREDENTIALS');
    }

    let guestId = null;
    let guestNumber = null;
    if (user.role === 'GUEST') {
      const guest = await Guest.findOne({ user_id: user.user_id });
      if (guest) {
        guestId = guest.guest_id;
        guestNumber = guest.guest_number;
      }
    }

    const tokenPayload = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      guest_id: guestId,
    };

    const accessToken = signAccessToken(tokenPayload);
    const refreshToken = signRefreshToken({ user_id: user.user_id });

    // Set refresh token in httpOnly cookie
    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      message: 'Login successful',
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        guest_id: guestId,
        guest_number: guestNumber,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh access token using httpOnly refresh token cookie.
 */
export const refresh = async (req, res, next) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      throw new UnauthorizedError('Refresh token required', null, 'REFRESH_TOKEN_REQUIRED');
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch {
      throw new UnauthorizedError(
        'Invalid or expired refresh token',
        null,
        'INVALID_REFRESH_TOKEN'
      );
    }

    const user = await User.findOne({ user_id: decoded.user_id });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('User account not found or inactive', null, 'USER_INACTIVE');
    }

    let guestId = null;
    if (user.role === 'GUEST') {
      const guest = await Guest.findOne({ user_id: user.user_id });
      if (guest) guestId = guest.guest_id;
    }

    const tokenPayload = {
      user_id: user.user_id,
      email: user.email,
      role: user.role,
      guest_id: guestId,
    };

    const newAccessToken = signAccessToken(tokenPayload);

    return res.status(200).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Logout user. Clears the httpOnly refresh token cookie.
 */
export const logout = async (req, res, next) => {
  try {
    clearRefreshTokenCookie(res);
    return res.status(200).json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current authenticated user details and profile.
 */
export const me = async (req, res, next) => {
  try {
    const user = await User.findOne({ user_id: req.user.user_id }, { passwordHash: 0 }).lean();
    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    let guestProfile = null;
    if (user.role === 'GUEST') {
      guestProfile = await Guest.findOne({ user_id: user.user_id }).lean();
    }

    return res.status(200).json({
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        role: user.role,
        guest_id: guestProfile?.guest_id || null,
        guest_number: guestProfile?.guest_number || null,
      },
      guest: guestProfile,
    });
  } catch (error) {
    next(error);
  }
};

export default { register, login, refresh, logout, me };
