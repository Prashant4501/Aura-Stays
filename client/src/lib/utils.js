import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/**
 * Formats integer paise into a clean Rupee currency string.
 * @param {number} paise
 * @param {boolean} [showDecimals=false]
 * @returns {string} e.g. "₹4,500" or "₹4,500.50"
 */
export function formatPaise(paise = 0, showDecimals = false) {
  if (typeof paise !== 'number' || isNaN(paise)) return '₹0';
  const rupees = paise / 100;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: showDecimals ? 2 : 0,
    minimumFractionDigits: showDecimals ? 2 : 0,
  }).format(rupees);
}

/**
 * Formats a Date object or string to YYYY-MM-DD in UTC.
 * @param {Date|string} date
 * @returns {string}
 */
export function toUtcDateString(date) {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * User-friendly date formatter e.g. "20 Sep 2026".
 * @param {Date|string} date
 * @returns {string}
 */
export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Calculates night difference between check-in and check-out.
 * @param {Date|string} checkIn
 * @param {Date|string} checkOut
 * @returns {number}
 */
export function calculateNights(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const inTime = new Date(checkIn).getTime();
  const outTime = new Date(checkOut).getTime();
  const diffDays = Math.round((outTime - inTime) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Generates random UUID for Idempotency-Key
 * @returns {string}
 */
export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idemp_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}
