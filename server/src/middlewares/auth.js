import { UnauthorizedError, ForbiddenError } from '../errors/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { User, Guest } from '../models/index.js';

/**
 * Authentication middleware.
 * Verifies JWT access token from Bearer Authorization header.
 * Attaches authenticated user and linked guest profile to req.user.
 */
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Authentication token is required');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedError('Authentication token is missing');
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Fetch user from DB to verify current status
    const user = await User.findOne({ user_id: decoded.user_id });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('User account not found or is inactive');
    }

    let guestId = null;
    if (user.role === 'GUEST') {
      const guest = await Guest.findOne({ user_id: user.user_id });
      guestId = guest ? guest.guest_id : null;
    }

    // Identity ALWAYS comes strictly from the verified token/database, NEVER request body
    req.user = {
      user_id: user.user_id,
      email: user.email,
      name: user.name,
      role: user.role,
      guest_id: guestId,
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role authorization middleware factory.
 * @param {...string} allowedRoles - e.g. 'ADMIN', 'PROPERTY_MANAGER', 'GUEST'
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Access denied: insufficient permissions'));
    }

    next();
  };
};

export default { authenticate, authorize };
