import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStellarNetwork, getStellarNetworkLabel } from './stellarNetwork';

describe('Stellar network configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('recognizes explicit mainnet and testnet settings', () => {
    expect(getStellarNetwork('mainnet')).toBe('mainnet');
    expect(getStellarNetwork(' TESTNET ')).toBe('testnet');
  });

  it('reads the configured public environment variable', () => {
    vi.stubEnv('NEXT_PUBLIC_STELLAR_NETWORK', 'testnet');
    expect(getStellarNetwork()).toBe('testnet');
    expect(getStellarNetworkLabel()).toBe('Stellar Testnet');
  });

  it('does not guess when network configuration is missing or invalid', () => {
    expect(getStellarNetwork(undefined)).toBe('unknown');
    expect(getStellarNetwork('')).toBe('unknown');
    expect(getStellarNetwork('preview')).toBe('unknown');
    expect(getStellarNetworkLabel('unknown')).toBe('Network unknown');
  });
});
