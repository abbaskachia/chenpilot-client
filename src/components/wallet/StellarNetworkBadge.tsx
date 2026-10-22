import React from 'react';
import { getStellarNetwork, getStellarNetworkLabel } from '@/config/stellarNetwork';

export function StellarNetworkBadge() {
  const network = getStellarNetwork();
  const label = getStellarNetworkLabel(network);

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-gray-700 px-3 py-1 text-xs font-medium text-gray-200"
      aria-label={`Active Stellar network: ${label}`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${network === 'mainnet' ? 'bg-emerald-400' : network === 'testnet' ? 'bg-amber-400' : 'bg-gray-500'}`}
      />
      {label}
    </span>
  );
}