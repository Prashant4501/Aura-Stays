import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const REFRESH_COOKIE_NAME = 'refreshToken';

/**
 * Signs a short-lived access token (15m)
 * @param {Object} payload - { user_id, email, role, guest_id }
 * @returns {string}
 */
export const signAccessToken = (payload) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
};

/**
 * Signs a long-lived refresh token (7d)
 * @param {Object} payload - { user_id }
 * @returns {string}
 */
export const signRefreshToken = (payload) => {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
};

/**
 * Verifies access token
 * @param {string} token
 * @returns {Object}
 */
export const verifyAccessToken = (token) => {
  return jwt.verify(token, env.JWT_SECRET);
};

/**
 * Verifies refresh token
 * @param {string} token
 * @returns {Object}
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, env.JWT_REFRESH_SECRET);
};

/**
 * Attaches the refresh token to the response in a secure, httpOnly cookie
 * @param {import('express').Response} res
 * @param {string} token
 */
export const setRefreshTokenCookie = (res, token) => {
  const isProd = env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });
};

/**
 * Clears the refresh token cookie
 * @param {import('express').Response} res
 */
export const clearRefreshTokenCookie = (res) => {
  const isProd = env.NODE_ENV === 'production';
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/v1/auth',
  });
};
