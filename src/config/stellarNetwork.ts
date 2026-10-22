export type StellarNetwork = 'mainnet' | 'testnet' | 'unknown';

export const getStellarNetwork = (
  configuredNetwork = process.env.NEXT_PUBLIC_STELLAR_NETWORK,
): StellarNetwork => {
  const normalizedNetwork = configuredNetwork?.trim().toLowerCase();
  return normalizedNetwork === 'mainnet' || normalizedNetwork === 'testnet'
    ? normalizedNetwork
    : 'unknown';
};

export const getStellarNetworkLabel = (network = getStellarNetwork()): string => {
  switch (network) {
    case 'mainnet':
      return 'Stellar Mainnet';
    case 'testnet':
      return 'Stellar Testnet';
    default:
      return 'Network unknown';
  }
};
