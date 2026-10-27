import { BadRequestError } from '../errors/AppError.js';

/**
 * Normalizes any Date or date string to UTC Midnight (00:00:00.000Z).
 * Ensures date-only values are timezone-invariant.
 *
 * @param {Date|string} dateInput
 * @returns {Date}
 */
export const normalizeToUtcMidnight = (dateInput) => {
  if (!dateInput) {
    throw new BadRequestError('Date value is required', null, 'INVALID_DATE');
  }

  let d;
  if (typeof dateInput === 'string') {
    // If string is YYYY-MM-DD, parse directly as UTC
    const parts = dateInput.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      d = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
    } else {
      d = new Date(dateInput);
    }
  } else if (dateInput instanceof Date) {
    d = dateInput;
  } else {
    d = new Date(dateInput);
  }

  if (isNaN(d.getTime())) {
    throw new BadRequestError(`Invalid date: ${dateInput}`, null, 'INVALID_DATE');
  }

  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
};

/**
 * Gets today's date in UTC Midnight.
 * @returns {Date}
 */
export const getUtcToday = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
};

/**
 * Formats a Date object as a YYYY-MM-DD string in UTC.
 * @param {Date} date
 * @returns {string}
 */
export const formatDateOnly = (date) => {
  const d = normalizeToUtcMidnight(date);
  return d.toISOString().split('T')[0];
};

/**
 * Validates check-in and check-out dates according to platform business rules:
 * - Check-in is inclusive, check-out is EXCLUSIVE.
 * - Rejects check_out <= check_in.
 * - Rejects past check-in dates (unless allowPast = true for historical tests).
 * - Rejects stays over 30 nights.
 *
 * @param {Date|string} checkInInput
 * @param {Date|string} checkOutInput
 * @param {Object} [options]
 * @param {boolean} [options.allowPast=false]
 * @param {number} [options.maxNights=30]
 * @returns {{ checkInUtc: Date, checkOutUtc: Date, nights: number }}
 */
export const validateDateRange = (checkInInput, checkOutInput, options = {}) => {
  const { allowPast = false, maxNights = 30 } = options;

  const checkInUtc = normalizeToUtcMidnight(checkInInput);
  const checkOutUtc = normalizeToUtcMidnight(checkOutInput);

  // 1. Reject check_out <= check_in
  if (checkOutUtc.getTime() <= checkInUtc.getTime()) {
    throw new BadRequestError(
      'Check-out date must be strictly after check-in date',
      null,
      'INVALID_DATE_RANGE'
    );
  }

  // 2. Reject past check-in dates
  if (!allowPast) {
    const todayUtc = getUtcToday();
    if (checkInUtc.getTime() < todayUtc.getTime()) {
      throw new BadRequestError('Check-in date cannot be in the past', null, 'PAST_CHECK_IN_DATE');
    }
  }

  // 3. Compute night count
  const msPerDay = 24 * 60 * 60 * 1000;
  const nights = Math.round((checkOutUtc.getTime() - checkInUtc.getTime()) / msPerDay);

  if (nights < 1) {
    throw new BadRequestError('Stay must be at least 1 night', null, 'INVALID_DATE_RANGE');
  }

  // 4. Reject stays over 30 nights
  if (nights > maxNights) {
    throw new BadRequestError(
      `Stays cannot exceed ${maxNights} nights (requested ${nights} nights)`,
      null,
      'EXCEEDS_MAX_STAY'
    );
  }

  return { checkInUtc, checkOutUtc, nights };
};

/**
 * Generates an array of Date objects representing each booked night
 * from check-in (inclusive) to check-out (EXCLUSIVE).
 *
 * E.g., 20 Sep to 25 Sep -> [20 Sep, 21 Sep, 22 Sep, 23 Sep, 24 Sep]
 *
 * @param {Date|string} checkInInput
 * @param {Date|string} checkOutInput
 * @returns {Date[]}
 */
export const generateNightsList = (checkInInput, checkOutInput) => {
  const checkInUtc = normalizeToUtcMidnight(checkInInput);
  const checkOutUtc = normalizeToUtcMidnight(checkOutInput);

  const nights = [];
  const current = new Date(checkInUtc);

  while (current.getTime() < checkOutUtc.getTime()) {
    nights.push(new Date(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return nights;
};

/**
 * Determines whether two date intervals [startA, endA) and [startB, endB) overlap.
 * With check-in inclusive and check-out exclusive:
 * Overlap occurs if and only if: startA < endB && endA > startB.
 *
 * Adjacent stays (e.g. A checkout on Sep 25, B checkin on Sep 25) do NOT overlap.
 *
 * @param {Date|string} startA
 * @param {Date|string} endA
 * @param {Date|string} startB
 * @param {Date|string} endB
 * @returns {boolean}
 */
export const hasDateRangeOverlap = (startA, endA, startB, endB) => {
  const sA = normalizeToUtcMidnight(startA).getTime();
  const eA = normalizeToUtcMidnight(endA).getTime();
  const sB = normalizeToUtcMidnight(startB).getTime();
  const eB = normalizeToUtcMidnight(endB).getTime();

  return sA < eB && eA > sB;
};

export default {
  normalizeToUtcMidnight,
  getUtcToday,
  formatDateOnly,
  validateDateRange,
  generateNightsList,
  hasDateRangeOverlap,
};
