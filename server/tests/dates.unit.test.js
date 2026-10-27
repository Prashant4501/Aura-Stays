import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasDateRangeOverlap,
  generateNightsList,
  validateDateRange,
  formatDateOnly,
  normalizeToUtcMidnight,
} from '../src/utils/dates.js';

describe('Date & Overlap Convention Unit Tests', () => {
  // Base reference stay: 20 September 2026 to 25 September 2026
  const existingStart = '2026-09-20';
  const existingEnd = '2026-09-25';

  it('1. Partial overlap (new booking overlaps start of existing stay)', () => {
    // 18 Sep to 21 Sep overlaps existing stay on night of 20 Sep
    const overlap = hasDateRangeOverlap(existingStart, existingEnd, '2026-09-18', '2026-09-21');
    assert.equal(overlap, true, '18-21 Sep must conflict with 20-25 Sep');
  });

  it('2. Partial overlap (new booking overlaps end of existing stay)', () => {
    // 23 Sep to 28 Sep overlaps existing stay on nights 23, 24 Sep
    const overlap = hasDateRangeOverlap(existingStart, existingEnd, '2026-09-23', '2026-09-28');
    assert.equal(overlap, true, '23-28 Sep must conflict with 20-25 Sep');
  });

  it('3. Containment (new booking is entirely inside existing stay)', () => {
    // 21 Sep to 24 Sep is entirely inside 20-25 Sep
    const overlap = hasDateRangeOverlap(existingStart, existingEnd, '2026-09-21', '2026-09-24');
    assert.equal(overlap, true, '21-24 Sep must conflict with 20-25 Sep');
  });

  it('4. Full overlap / Enclosure (new booking encloses existing stay)', () => {
    // 19 Sep to 26 Sep completely encloses 20-25 Sep
    const overlap = hasDateRangeOverlap(existingStart, existingEnd, '2026-09-19', '2026-09-26');
    assert.equal(overlap, true, '19-26 Sep must conflict with 20-25 Sep');
  });

  it('5. Adjacent stay after (new booking starts on existing checkout date)', () => {
    // 25 Sep to 30 Sep: checkout is exclusive, check-in is inclusive -> NO CONFLICT
    const overlap = hasDateRangeOverlap(existingStart, existingEnd, '2026-09-25', '2026-09-30');
    assert.equal(
      overlap,
      false,
      '25-30 Sep must NOT conflict with 20-25 Sep (check-out exclusive)'
    );
  });

  it('6. Adjacent stay before (new booking checks out on existing checkin date)', () => {
    // 15 Sep to 20 Sep: checkout is exclusive, check-in is inclusive -> NO CONFLICT
    const overlap = hasDateRangeOverlap(existingStart, existingEnd, '2026-09-15', '2026-09-20');
    assert.equal(
      overlap,
      false,
      '15-20 Sep must NOT conflict with 20-25 Sep (check-in on checkout date)'
    );
  });

  it('7. Multi-day stay night generation (check-in inclusive, check-out exclusive)', () => {
    const nights = generateNightsList('2026-09-20', '2026-09-25');
    assert.equal(nights.length, 5, '20 Sep to 25 Sep occupies exactly 5 nights');

    const formattedNights = nights.map(formatDateOnly);
    assert.deepEqual(formattedNights, [
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
    ]);
  });

  it('8. Same-day reservation request (check_out == check_in) is rejected', () => {
    assert.throws(
      () => validateDateRange('2026-11-10', '2026-11-10', { allowPast: true }),
      /Check-out date must be strictly after check-in date/
    );
  });

  it('9. Inverted date range (check_out < check_in) is rejected', () => {
    assert.throws(
      () => validateDateRange('2026-11-15', '2026-11-10', { allowPast: true }),
      /Check-out date must be strictly after check-in date/
    );
  });

  it('10. Stays exceeding 30 nights are rejected', () => {
    assert.throws(
      () => validateDateRange('2026-11-01', '2026-12-05', { allowPast: true }),
      /Stays cannot exceed 30 nights/
    );
  });

  it('11. Past check-in dates are rejected by default', () => {
    assert.throws(
      () => validateDateRange('2020-01-01', '2020-01-05', { allowPast: false }),
      /Check-in date cannot be in the past/
    );
  });

  it('12. Normalizes dates to UTC midnight consistently', () => {
    const date1 = normalizeToUtcMidnight('2026-11-15T18:45:00.000Z');
    const date2 = normalizeToUtcMidnight('2026-11-15');

    assert.equal(date1.toISOString(), '2026-11-15T00:00:00.000Z');
    assert.equal(date2.toISOString(), '2026-11-15T00:00:00.000Z');
    assert.equal(date1.getTime(), date2.getTime());
  });
});
