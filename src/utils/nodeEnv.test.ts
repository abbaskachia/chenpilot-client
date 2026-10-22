/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';

describe('node environment', () => {
  it('runs without jsdom globals', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
