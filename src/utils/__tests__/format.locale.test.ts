import { describe, it, expect } from 'vitest';
import {
  formatTransactionAmount,
  formatTransactionFee,
  formatTransactionDate,
  ASSET_PRECISION,
} from '../format';
import { getLocaleForLanguage } from '@/lib/i18n/i18n';

describe('Locale-aware Transaction Formatting', () => {
  describe('Language to Locale Mapping', () => {
    it('maps supported application languages to canonical locales', () => {
      expect(getLocaleForLanguage('en')).toBe('en-US');
      expect(getLocaleForLanguage('ar')).toBe('ar-SA');
      expect(getLocaleForLanguage('es')).toBe('es-ES');
      expect(getLocaleForLanguage('fr')).toBe('fr-FR');
    });

    it('falls back safely to en-US when language is missing or unknown', () => {
      expect(getLocaleForLanguage(undefined)).toBe('en-US');
      expect(getLocaleForLanguage('unknown')).toBe('en-US');
    });

    it('preserves explicit BCP 47 locales if supplied', () => {
      expect(getLocaleForLanguage('en-GB')).toBe('en-GB');
      expect(getLocaleForLanguage('fr-CA')).toBe('fr-CA');
    });
  });

  describe('formatTransactionAmount - Decimal and Grouping Separators', () => {
    const amount = '1234567.89';

    it('formats with English locale (comma grouping, period decimal)', () => {
      const formatted = formatTransactionAmount(amount, { language: 'en', decimals: 2 });
      expect(formatted).toBe('1,234,567.89');
    });

    it('formats with Spanish locale (period grouping, comma decimal)', () => {
      const formatted = formatTransactionAmount(amount, { language: 'es', decimals: 2 });
      // In es-ES, grouping is either '.' or non-breaking space, decimal is ','
      expect(formatted).toContain(',');
      expect(formatted).toMatch(/1[.\s\u00a0\u202f]?234[.\s\u00a0\u202f]?567,89/);
    });

    it('formats with French locale (space grouping, comma decimal)', () => {
      const formatted = formatTransactionAmount(amount, { language: 'fr', decimals: 2 });
      // In fr-FR, grouping uses spaces (\u00a0, \u202f, or standard space) and decimal is ','
      expect(formatted).toContain(',');
      expect(formatted).toMatch(/1[\s\u00a0\u202f]234[\s\u00a0\u202f]567,89/);
    });

    it('formats with Arabic locale', () => {
      const formatted = formatTransactionAmount(amount, { language: 'ar', decimals: 2 });
      // Should format without crashing and produce localized representation
      expect(formatted).not.toBe('-');
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('formatTransactionAmount - Zero and Negative Values', () => {
    it('formats zero correctly across locales', () => {
      expect(formatTransactionAmount('0', { language: 'en' })).toBe('0');
      expect(formatTransactionAmount('0', { language: 'fr' })).toBe('0');
      expect(formatTransactionAmount('0', { language: 'es' })).toBe('0');
    });

    it('does not format negative zero as -0', () => {
      expect(formatTransactionAmount('-0', { language: 'en' })).toBe('0');
      expect(formatTransactionAmount('-0.00', { language: 'en', decimals: 2 })).toBe('0.00');
    });

    it('formats negative numbers correctly with appropriate minus sign', () => {
      const negativeVal = '-1234.50';
      const en = formatTransactionAmount(negativeVal, { language: 'en', decimals: 2 });
      expect(en).toMatch(/^-1,234\.50$/);

      const fr = formatTransactionAmount(negativeVal, { language: 'fr', decimals: 2 });
      expect(fr).toMatch(/^-1[\s\u00a0\u202f]234,50$/);
    });
  });

  describe('formatTransactionAmount - Asset Precision and High-Precision Decimals', () => {
    it('uses standard XLM precision (7 decimals) when asset is XLM', () => {
      expect(ASSET_PRECISION.XLM).toBe(7);
      const formatted = formatTransactionAmount('10.1234567', {
        language: 'en',
        asset: 'XLM',
      });
      expect(formatted).toBe('10.1234567 XLM');
    });

    it('preserves exact fractional digits beyond standard 2-decimal currencies', () => {
      const smallAmount = '0.0000001';
      const formatted = formatTransactionAmount(smallAmount, { language: 'en', asset: 'XLM' });
      expect(formatted).toBe('0.0000001 XLM');
    });

    it('supports arbitrary explicit precision override', () => {
      const amount = '1.23456789123456789';
      const formatted = formatTransactionAmount(amount, {
        language: 'en',
        decimals: 8,
      });
      expect(formatted).toBe('1.23456789');
    });

    it('appends Left-to-Right mark for Arabic locale asset symbols', () => {
      const formatted = formatTransactionAmount('10.5', { language: 'ar', asset: 'XLM' });
      // Must contain XLM and the LRM character \u200E
      expect(formatted).toContain('XLM');
      expect(formatted).toContain('\u200E');
    });
  });

  describe('formatTransactionAmount - Prevention of Floating-Point Precision Loss', () => {
    it('preserves numbers that exceed JavaScript IEEE 754 safe integer limits (> 2^53 - 1)', () => {
      // 9007199254740993 cannot be safely represented in standard IEEE-754 double float without loss
      const largeExactAmount = '9007199254740993.1234567';
      const formatted = formatTransactionAmount(largeExactAmount, {
        language: 'en',
        decimals: 7,
      });

      // Assert integer part preserves the exact '993' ending rather than float rounding to '992'
      expect(formatted).toContain('9,007,199,254,740,993.1234567');
    });

    it('handles high-precision crypto values without scientific notation or precision loss', () => {
      const weiAmount = '100000000000000000000.000000000000000001';
      const formatted = formatTransactionAmount(weiAmount, {
        language: 'en',
        decimals: 18,
      });

      expect(formatted).not.toContain('e+');
      expect(formatted).toContain('100,000,000,000,000,000,000.000000000000000001');
    });
  });

  describe('formatTransactionAmount - Handling Missing or Invalid Values', () => {
    it('returns "-" for null, undefined, empty, or non-numeric strings', () => {
      expect(formatTransactionAmount(null)).toBe('-');
      expect(formatTransactionAmount(undefined)).toBe('-');
      expect(formatTransactionAmount('')).toBe('-');
      expect(formatTransactionAmount('   ')).toBe('-');
      expect(formatTransactionAmount('invalid-string')).toBe('-');
      expect(formatTransactionAmount(NaN)).toBe('-');
    });
  });

  describe('formatTransactionFee', () => {
    it('formats transaction fee with default 7 decimal places for XLM', () => {
      const fee = '0.0000100';
      const formatted = formatTransactionFee(fee, { language: 'en', asset: 'XLM' });
      expect(formatted).toBe('0.0000100 XLM');
    });

    it('formats fees in Spanish and French with locale separators', () => {
      const fee = '1000.5';
      const es = formatTransactionFee(fee, { language: 'es', asset: 'XLM', decimals: 1 });
      expect(es).toContain(',');
      expect(es).toContain('XLM');

      const fr = formatTransactionFee(fee, { language: 'fr', asset: 'XLM', decimals: 1 });
      expect(fr).toContain(',');
      expect(fr).toContain('XLM');
    });

    it('safely handles missing fee values', () => {
      expect(formatTransactionFee(null)).toBe('-');
      expect(formatTransactionFee(undefined)).toBe('-');
    });
  });

  describe('formatTransactionDate - Localized Dates & Consistent Timezone Policy', () => {
    // 2026-05-15T14:30:00Z
    const timestamp = '2026-05-15T14:30:00Z';

    it('formats in UTC timezone by default across all locales', () => {
      const en = formatTransactionDate(timestamp, { language: 'en' });
      expect(en).toContain('May 15, 2026');
      expect(en).toContain('2:30 PM');

      const fr = formatTransactionDate(timestamp, { language: 'fr' });
      expect(fr).toContain('15 mai 2026');
      expect(fr).toContain('14:30');

      const es = formatTransactionDate(timestamp, { language: 'es' });
      expect(es).toContain('15 may 2026');
      expect(es).toContain('14:30');
    });

    it('formats Arabic date correctly without crashing', () => {
      const ar = formatTransactionDate(timestamp, { language: 'ar' });
      expect(ar).not.toBe('-');
      expect(ar.length).toBeGreaterThan(0);
    });

    it('handles numeric epoch timestamps and Date instances', () => {
      const dateObj = new Date(timestamp);
      const enFromDate = formatTransactionDate(dateObj, { language: 'en' });
      expect(enFromDate).toContain('May 15, 2026');

      const enFromEpoch = formatTransactionDate(dateObj.getTime(), { language: 'en' });
      expect(enFromEpoch).toContain('May 15, 2026');
    });

    it('returns "-" for invalid timestamps safely', () => {
      expect(formatTransactionDate('not-a-date')).toBe('-');
      expect(formatTransactionDate(null)).toBe('-');
      expect(formatTransactionDate(undefined)).toBe('-');
    });
  });
});
