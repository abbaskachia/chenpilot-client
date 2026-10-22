import { describe, expect, it } from 'vitest';
import { calculateSpendableNativeBalance } from '../nativeBalance';

describe('calculateSpendableNativeBalance', () => {
  it('subtracts the required reserve from the total native balance', () => {
    expect(calculateSpendableNativeBalance('12.5', '1')).toBe(11.5);
  });

  it('clamps spendable balance to zero when total is below reserve', () => {
    expect(calculateSpendableNativeBalance('0.5', '1')).toBe(0);
    expect(calculateSpendableNativeBalance('0', '0')).toBe(0);
  });

  it('omits a breakdown containing invalid or negative values', () => {
    expect(calculateSpendableNativeBalance('unknown', '1')).toBeNull();
    expect(calculateSpendableNativeBalance('1', '-1')).toBeNull();
    expect(calculateSpendableNativeBalance('', '0')).toBeNull();
  });
});