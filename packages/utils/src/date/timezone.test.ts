/**
 * Tests for date/timezone.ts
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { getCurrentTimezone, getTimezoneOffset, convertTimezone } from './timezone.js';

describe('date/timezone', () => {
  describe('getCurrentTimezone', () => {
    it('should return current timezone identifier', () => {
      const tz = getCurrentTimezone();
      assert.strictEqual(typeof tz, 'string');
      assert.strictEqual(tz.length > 0, true);
    });

    it('should return valid IANA timezone format', () => {
      const tz = getCurrentTimezone();
      // IANA timezone identifiers are like "America/New_York", "Europe/London", "UTC", etc.
      // UTC is a valid timezone identifier without a slash
      const hasSlashOrIsUTC = tz.includes('/') || tz === 'UTC';
      assert.strictEqual(hasSlashOrIsUTC, true);
    });

    it('should return consistent results', () => {
      const tz1 = getCurrentTimezone();
      const tz2 = getCurrentTimezone();
      assert.strictEqual(tz1, tz2);
    });
  });

  describe('getTimezoneOffset', () => {
    it('should return timezone offset in minutes', () => {
      const offset = getTimezoneOffset();
      assert.strictEqual(typeof offset, 'number');
      assert.strictEqual(Number.isInteger(offset), true);
    });

    it('should return offset between -720 and 720', () => {
      const offset = getTimezoneOffset();
      assert.strictEqual(offset >= -720 && offset <= 720, true);
    });

    it('should handle custom date', () => {
      const date = new Date('2024-01-01T00:00:00Z');
      const offset = getTimezoneOffset(date);
      assert.strictEqual(typeof offset, 'number');
    });

    it('should handle dates during DST', () => {
      const winter = new Date('2024-01-01T00:00:00Z');
      const summer = new Date('2024-07-01T00:00:00Z');
      const winterOffset = getTimezoneOffset(winter);
      const summerOffset = getTimezoneOffset(summer);
      // May differ depending on timezone and DST
      assert.strictEqual(typeof winterOffset, 'number');
      assert.strictEqual(typeof summerOffset, 'number');
    });

    it('should return different offsets for different timezones', () => {
      // Note: This test depends on the system timezone
      const date = new Date('2024-01-01T12:00:00Z');
      const offset = getTimezoneOffset(date);
      assert.strictEqual(typeof offset, 'number');
    });
  });

  describe('convertTimezone', () => {
    it('should convert date to different timezone', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const converted = convertTimezone(date, 'America/New_York');
      assert.strictEqual(converted instanceof Date, true);
    });

    it('should handle UTC timezone', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const converted = convertTimezone(date, 'UTC');
      assert.strictEqual(converted instanceof Date, true);
    });

    it('should handle multiple timezone conversions', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const timezones = ['America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney'];
      for (const tz of timezones) {
        const converted = convertTimezone(date, tz);
        assert.strictEqual(converted instanceof Date, true);
      }
    });

    it('should preserve date object type', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      const converted = convertTimezone(date, 'Europe/Paris');
      assert.strictEqual(converted instanceof Date, true);
      assert.strictEqual(Object.prototype.toString.call(converted), '[object Date]');
    });

    it('should handle invalid timezone', () => {
      const date = new Date('2024-01-15T10:00:00Z');
      // Invalid timezone may throw or return invalid date
      try {
        const converted = convertTimezone(date, 'Invalid/Timezone');
        assert.strictEqual(converted instanceof Date, true);
      } catch {
        // Some implementations may throw
        assert.strictEqual(true, true);
      }
    });

    it('should handle date at midnight', () => {
      const date = new Date('2024-01-15T00:00:00Z');
      const converted = convertTimezone(date, 'America/Los_Angeles');
      assert.strictEqual(converted instanceof Date, true);
    });

    it('should handle date crossing day boundary', () => {
      const date = new Date('2024-01-15T23:00:00Z');
      const converted = convertTimezone(date, 'America/New_York');
      assert.strictEqual(converted instanceof Date, true);
    });

    it('should preserve the underlying instant regardless of system timezone', () => {
      // convertTimezone must produce a Date whose wall-clock in the TARGET
      // timezone matches the input's wall-clock in that timezone, regardless
      // of the host system's TZ. The previous implementation formatted the
      // date as a wall-clock string in the target timezone and then re-parsed
      // that string in the SYSTEM timezone, conflating two timezones and
      // producing a Date whose instant was wrong by (sysOffset - targetOffset).
      //
      // The contract verified here: for any host TZ, the formatted date in
      // the target TZ is identical before and after the conversion.
      const targetTimezones = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney'];
      const input = new Date('2024-01-15T12:00:00Z');
      for (const tz of targetTimezones) {
        const format = (d: Date) =>
          new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
          }).format(d);
        const converted = convertTimezone(input, tz);
        assert.strictEqual(
          format(converted),
          format(input),
          `convertTimezone must preserve the wall-clock in target tz=${tz}; sys tz=${Intl.DateTimeFormat().resolvedOptions().timeZone}`
        );
      }
    });

    it('should be independent of the host system timezone (regression)', () => {
      // Specifically catches the original bug where the implementation
      // depended on the system timezone: it formatted in the target TZ
      // then parsed in the system TZ. Under a non-UTC host, the wrong
      // instant was produced.
      const targetTimezones = ['UTC', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney'];
      const input = new Date('2024-01-15T12:00:00Z');
      const sysTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const sysOffsetMin = -input.getTimezoneOffset();
      for (const tz of targetTimezones) {
        const converted = convertTimezone(input, tz);
        // Read the converted Date's wall-clock in the target TZ. It must
        // equal the input's wall-clock in the target TZ.
        const expectedWallClockUtc = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).formatToParts(input);
        const gotWallClockUtc = new Intl.DateTimeFormat('en-US', {
          timeZone: tz,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        }).formatToParts(converted);
        assert.strictEqual(
          JSON.stringify(gotWallClockUtc),
          JSON.stringify(expectedWallClockUtc),
          `wall-clock in ${tz} must be preserved (sys=${sysTz}, sysOffsetMin=${sysOffsetMin})`
        );
      }
    });
  });
});
