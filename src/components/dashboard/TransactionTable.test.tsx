import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StellarTransaction, StellarOperation } from '@/types';

// Mutable "selected application language" exposed to the mocked store so that a
// language change can be simulated without booting the real Redux store.
const appState = vi.hoisted(() => ({ language: 'en' as string }));

vi.mock('@/store', () => ({
  useAppSelector: (selector: (state: { ui: { language: string } }) => unknown) =>
    selector({ ui: { language: appState.language } }),
}));

import TransactionTable, {
  getOperationDirection,
  getTransactionDirection,
  formatTransactionAmount,
  resolveAssetIdentifier,
  formatAssetDisplay,
  formatAssetAmount,
} from './TransactionTable';

const transactions: StellarTransaction[] = [
  {
    id: 'tx-1',
    hash: 'GABCDEF12345678901234567890123456789012345678901234567890',
    ledger: 123456,
    created_at: '2026-05-15T14:30:00Z',
    source_account: 'GSOURCEACCOUNT',
    fee_charged: '100',
    operation_count: 1,
    successful: true,
    operations: [
      {
        id: 'op-1',
        type: 'payment',
        amount: '1234567.89',
        asset: 'XLM',
        source_account: 'GSOURCEACCOUNT',
      },
    ],
  },
];

const baseProps = {
  transactions,
  isLoading: false,
  error: null,
  currentPage: 1,
  pageSize: 10,
  totalCount: 1,
  onPageChange: vi.fn(),
  onPageSizeChange: vi.fn(),
};

describe('TransactionTable locale-aware formatting', () => {
  beforeEach(() => {
    appState.language = 'en';
    baseProps.onPageChange.mockClear();
    baseProps.onPageSizeChange.mockClear();
  });

  it('formats amounts, fees and dates with English locale separators and XLM precision', () => {
    render(<TransactionTable {...baseProps} />);

    expect(screen.getByText('1,234,567.8900000 XLM')).toBeInTheDocument();
    expect(screen.getByText(/^Fee: 100\.0000000 XLM$/)).toBeInTheDocument();
    expect(screen.getByText(/May 15, 2026/)).toBeInTheDocument();
  });

  it('re-renders amounts, fees and dates with the newly selected language', () => {
    const { unmount } = render(<TransactionTable {...baseProps} />);
    expect(screen.getByText('1,234,567.8900000 XLM')).toBeInTheDocument();
    unmount();

    appState.language = 'fr';
    render(<TransactionTable {...baseProps} />);

    // French: space grouping, comma decimal, 7-decimal XLM precision
    expect(
      screen.getByText(/1[\s\u00a0\u202f]234[\s\u00a0\u202f]567,8900000 XLM/)
    ).toBeInTheDocument();
    expect(screen.getByText(/^Fee: 100,0000000 XLM$/)).toBeInTheDocument();
    expect(screen.getByText(/15 mai 2026/)).toBeInTheDocument();
    expect(screen.queryByText('1,234,567.8900000 XLM')).not.toBeInTheDocument();
    expect(screen.queryByText(/May 15, 2026/)).not.toBeInTheDocument();
  });

  it('preserves pagination display and callbacks', () => {
    render(<TransactionTable {...baseProps} totalCount={25} pageSize={10} />);

    expect(
      screen.getByText('Showing 1 to 10 of 25 transactions')
    ).toBeInTheDocument();
    expect(screen.getByText('Per page:')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /per page/i })).toHaveValue('10');
  });
});

describe('Transaction Direction Classification & Amount Formatting', () => {
  const activeUser = 'GACTIVEUSERADDRESS12345678901234567890123456789012345678';
  const otherUser = 'GOTHERUSERADDRESS123456789012345678901234567890123456788';

  beforeEach(() => {
    appState.language = 'en';
  });

  describe('getOperationDirection', () => {
    it('classifies incoming payments correctly', () => {
      const op: StellarOperation = {
        id: 'op-1',
        type: 'payment',
        amount: '100.00',
        asset: 'XLM',
        from: otherUser,
        to: activeUser,
        source_account: otherUser,
      };

      expect(getOperationDirection(op, activeUser)).toBe('incoming');
    });

    it('classifies outgoing payments correctly', () => {
      const op: StellarOperation = {
        id: 'op-2',
        type: 'payment',
        amount: '50.00',
        asset: 'USDC',
        from: activeUser,
        to: otherUser,
        source_account: activeUser,
      };

      expect(getOperationDirection(op, activeUser)).toBe('outgoing');
    });

    it('classifies self-transfers correctly', () => {
      const op: StellarOperation = {
        id: 'op-3',
        type: 'payment',
        amount: '25.00',
        asset: 'XLM',
        from: activeUser,
        to: activeUser,
        source_account: activeUser,
      };

      expect(getOperationDirection(op, activeUser)).toBe('self');
    });

    it('handles case-insensitive address matching', () => {
      const op: StellarOperation = {
        id: 'op-4',
        type: 'payment',
        amount: '10.00',
        asset: 'XLM',
        from: otherUser.toLowerCase(),
        to: activeUser.toUpperCase(),
        source_account: otherUser.toLowerCase(),
      };

      expect(getOperationDirection(op, activeUser)).toBe('incoming');
    });

    it('falls back to transaction source account if op source is not provided', () => {
      const op: Partial<StellarOperation> = {
        id: 'op-5',
        type: 'payment',
        amount: '10.00',
        to: otherUser,
      };

      expect(getOperationDirection(op, activeUser, activeUser)).toBe('outgoing');
    });

    it('returns unknown when operation accounts are missing or neither matches active account', () => {
      // Missing operation accounts
      const emptyOp: Partial<StellarOperation> = {
        id: 'op-6',
        type: 'manage_data',
      };
      expect(getOperationDirection(emptyOp, activeUser)).toBe('unknown');

      // Neither matches active account
      const thirdPartyOp: StellarOperation = {
        id: 'op-7',
        type: 'payment',
        amount: '10.00',
        from: 'GALICE...',
        to: 'GBOB...',
        source_account: 'GALICE...',
      };
      expect(getOperationDirection(thirdPartyOp, activeUser)).toBe('unknown');

      // Missing active account address
      expect(getOperationDirection(emptyOp, null)).toBe('unknown');
      expect(getOperationDirection(emptyOp, '')).toBe('unknown');

      // Undefined operation
      expect(getOperationDirection(null, activeUser)).toBe('unknown');

      // Non-transfer operation with missing destination
      const trustOp: StellarOperation = {
        id: 'op-8',
        type: 'change_trust',
        source_account: activeUser,
      };
      expect(getOperationDirection(trustOp, activeUser)).toBe('unknown');
    });
  });

  describe('getTransactionDirection', () => {
    it('determines direction from primary operation', () => {
      const tx: StellarTransaction = {
        id: 'tx-1',
        hash: '0x123',
        ledger: 100,
        created_at: '2026-10-20T10:00:00Z',
        source_account: otherUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        operations: [
          {
            id: 'op-1',
            type: 'payment',
            amount: '200',
            asset: 'XLM',
            from: otherUser,
            to: activeUser,
            source_account: otherUser,
          },
        ],
      };

      expect(getTransactionDirection(tx, activeUser)).toBe('incoming');
    });

    it('returns unknown when operations array is empty', () => {
      const tx: StellarTransaction = {
        id: 'tx-2',
        hash: '0x456',
        ledger: 101,
        created_at: '2026-10-20T10:05:00Z',
        source_account: activeUser,
        fee_charged: '100',
        operation_count: 0,
        successful: true,
        operations: [],
      };

      expect(getTransactionDirection(tx, activeUser)).toBe('unknown');
    });
  });

  describe('formatTransactionAmount', () => {
    it('formats incoming amounts with a leading plus sign', () => {
      expect(formatTransactionAmount('150.00', 'incoming', 'XLM', 2)).toBe('+150 XLM');
      expect(formatTransactionAmount('25.50', 'incoming', 'USDC', 2)).toBe('+25.5 USDC');
    });

    it('formats outgoing amounts with a leading minus sign', () => {
      expect(formatTransactionAmount('50.00', 'outgoing', 'XLM', 2)).toBe('-50 XLM');
      expect(formatTransactionAmount('12.34', 'outgoing', 'AQUA', 2)).toBe('-12.34 AQUA');
    });

    it('formats self-transfers without plus or minus signs', () => {
      expect(formatTransactionAmount('100.00', 'self', 'XLM', 2)).toBe('100 XLM');
    });

    it('formats unknown direction without sign', () => {
      expect(formatTransactionAmount('10.00', 'unknown', 'XLM', 2)).toBe('10 XLM');
    });

    it('returns "-" when amount is missing or empty', () => {
      expect(formatTransactionAmount(undefined, 'incoming')).toBe('-');
      expect(formatTransactionAmount(null, 'outgoing')).toBe('-');
      expect(formatTransactionAmount('', 'self')).toBe('-');
    });
  });
});

describe('TransactionTable - Asset Disambiguation & Canonical Identifiers', () => {
  const issuerA = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
  const issuerB = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  beforeEach(() => {
    appState.language = 'en';
  });

  describe('resolveAssetIdentifier', () => {
    it('resolves native XLM correctly without an issuer', () => {
      expect(resolveAssetIdentifier('XLM')).toEqual({
        code: 'XLM',
        issuer: undefined,
        isNative: true,
        canonical: 'XLM',
        hasIncompleteMetadata: false,
      });

      expect(resolveAssetIdentifier('native')).toEqual({
        code: 'XLM',
        issuer: undefined,
        isNative: true,
        canonical: 'XLM',
        hasIncompleteMetadata: false,
      });

      expect(resolveAssetIdentifier(null, null, 'native')).toEqual({
        code: 'XLM',
        issuer: undefined,
        isNative: true,
        canonical: 'XLM',
        hasIncompleteMetadata: false,
      });

      // Safe fallback when metadata is missing
      expect(resolveAssetIdentifier(null)).toEqual({
        code: 'XLM',
        issuer: undefined,
        isNative: true,
        canonical: 'XLM',
        hasIncompleteMetadata: false,
      });
    });

    it('resolves canonical CODE:ISSUER strings correctly', () => {
      const canonical = `USDC:${issuerA}`;
      const result = resolveAssetIdentifier(canonical);
      expect(result).toEqual({
        code: 'USDC',
        issuer: issuerA,
        isNative: false,
        canonical,
        hasIncompleteMetadata: false,
      });
    });

    it('resolves distinct canonical identifiers for same-code distinct issuers', () => {
      const assetA = resolveAssetIdentifier(`USDC:${issuerA}`);
      const assetB = resolveAssetIdentifier('USDC', issuerB);

      expect(assetA.code).toBe(assetB.code); // Same ticker "USDC"
      expect(assetA.issuer).not.toBe(assetB.issuer); // Distinct issuers
      expect(assetA.canonical).toBe(`USDC:${issuerA}`);
      expect(assetB.canonical).toBe(`USDC:${issuerB}`);
      expect(assetA.canonical).not.toBe(assetB.canonical);
    });

    it('provides a safe fallback flag when metadata is incomplete (missing issuer)', () => {
      const incompleteAsset = resolveAssetIdentifier('USDC');
      expect(incompleteAsset).toEqual({
        code: 'USDC',
        issuer: undefined,
        isNative: false,
        canonical: 'USDC',
        hasIncompleteMetadata: true,
      });
    });
  });

  describe('formatAssetDisplay', () => {
    it('formats native asset display', () => {
      expect(formatAssetDisplay('XLM')).toBe('XLM');
    });

    it('formats canonical and compact issued asset display', () => {
      expect(formatAssetDisplay(`USDC:${issuerA}`)).toBe(`USDC:${issuerA}`);
      expect(formatAssetDisplay(`USDC:${issuerA}`, null, { compact: true })).toBe(
        'USDC (GA5Z...KZVN)'
      );
    });

    it('displays unverified indicator on incomplete metadata', () => {
      expect(formatAssetDisplay('USDC')).toBe('USDC (unverified)');
    });
  });

  describe('formatAssetAmount', () => {
    it('formats amounts with code', () => {
      expect(formatAssetAmount('100.00', 'XLM')).toBe('100 XLM');
      expect(formatAssetAmount('50.50', 'USDC')).toBe('50.5 USDC');
    });

    it('supports canonical and compact issuer options', () => {
      expect(
        formatAssetAmount('100', `USDC:${issuerA}`, null, 2, {
          showCanonical: true,
        })
      ).toBe(`100 USDC:${issuerA}`);

      expect(
        formatAssetAmount('100', `USDC:${issuerA}`, null, 2, {
          compactIssuer: true,
        })
      ).toBe('100 USDC (GA5Z...KZVN)');
    });

    it('returns "-" when amount is missing', () => {
      expect(formatAssetAmount(undefined)).toBe('-');
      expect(formatAssetAmount(null)).toBe('-');
      expect(formatAssetAmount('')).toBe('-');
    });
  });

  describe('TransactionTable Component Rendering', () => {
    const activeUser = 'GACTIVEUSERADDRESS12345678901234567890123456789012345678';
    const otherUser = 'GOTHERUSERADDRESS123456789012345678901234567890123456788';

    const mockTxs: StellarTransaction[] = [
      {
        id: 'tx-incoming',
        hash: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        ledger: 501,
        created_at: '2026-10-20T12:00:00Z',
        source_account: otherUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        operations: [
          {
            id: 'op-in',
            type: 'payment',
            amount: '100',
            asset: 'XLM',
            from: otherUser,
            to: activeUser,
            source_account: otherUser,
          },
        ],
      },
      {
        id: 'tx-usdc-issuer-a',
        hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ledger: 502,
        created_at: '2026-10-20T12:05:00Z',
        source_account: activeUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        operations: [
          {
            id: 'op-usdc-a',
            type: 'payment',
            amount: '45.5',
            asset: `USDC:${issuerA}`,
            from: activeUser,
            to: otherUser,
            source_account: activeUser,
          },
        ],
      },
      {
        id: 'tx-usdc-issuer-b',
        hash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        ledger: 503,
        created_at: '2026-10-20T12:10:00Z',
        source_account: otherUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        operations: [
          {
            id: 'op-usdc-b',
            type: 'payment',
            amount: '80',
            asset: 'USDC',
            asset_issuer: issuerB,
            from: otherUser,
            to: activeUser,
            source_account: otherUser,
          },
        ],
      },
      {
        id: 'tx-usdc-incomplete',
        hash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        ledger: 504,
        created_at: '2026-10-20T12:15:00Z',
        source_account: otherUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        operations: [
          {
            id: 'op-incomplete',
            type: 'payment',
            amount: '10',
            asset: 'USDC', // No issuer provided!
            from: otherUser,
            to: activeUser,
            source_account: otherUser,
          },
        ],
      },
      {
        id: 'tx-self',
        hash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        ledger: 505,
        created_at: '2026-10-20T12:20:00Z',
        source_account: activeUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        operations: [
          {
            id: 'op-self',
            type: 'payment',
            amount: '20',
            asset: 'XLM',
            from: activeUser,
            to: activeUser,
            source_account: activeUser,
          },
        ],
      },
      {
        id: 'tx-unknown',
        hash: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        ledger: 506,
        created_at: '2026-10-20T12:25:00Z',
        source_account: activeUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        operations: [
          {
            id: 'op-unknown',
            type: 'change_trust',
            source_account: activeUser,
          },
        ],
      },
    ];

    it('renders directional badges, amounts, and handles distinct asset issuers and fallbacks', () => {
      render(
        <TransactionTable
          transactions={mockTxs}
          isLoading={false}
          error={null}
          currentPage={1}
          pageSize={10}
          totalCount={6}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
          activeAccountAddress={activeUser}
        />
      );

      // Check Direction column header
      expect(screen.getByText('Direction')).toBeDefined();

      // Check Incoming XLM row (no issuer badge needed)
      const inDirection = screen.getByTestId('tx-direction-tx-incoming');
      expect(inDirection.textContent?.toLowerCase()).toBe('incoming');
      const inAmount = screen.getByTestId('tx-amount-tx-incoming');
      expect(inAmount.textContent).toBe('+100.0000000 XLM');
      expect(screen.queryByTestId('tx-asset-issuer-tx-incoming')).toBeNull();

      // Check Outgoing USDC with Issuer A
      const outDirection = screen.getByTestId('tx-direction-tx-usdc-issuer-a');
      expect(outDirection.textContent?.toLowerCase()).toBe('outgoing');
      const amountA = screen.getByTestId('tx-amount-tx-usdc-issuer-a');
      expect(amountA.textContent).toBe('-45.5000000 USDC');
      const issuerElemA = screen.getByTestId('tx-asset-issuer-tx-usdc-issuer-a');
      expect(issuerElemA.textContent).toContain('GA5Z...KZVN');
      expect(issuerElemA.getAttribute('title')).toBe(`Canonical Asset: USDC:${issuerA}`);

      // Check Incoming USDC with Issuer B (same code "USDC", distinct issuer)
      const bDirection = screen.getByTestId('tx-direction-tx-usdc-issuer-b');
      expect(bDirection.textContent?.toLowerCase()).toBe('incoming');
      const amountB = screen.getByTestId('tx-amount-tx-usdc-issuer-b');
      expect(amountB.textContent).toBe('+80.0000000 USDC');
      const issuerElemB = screen.getByTestId('tx-asset-issuer-tx-usdc-issuer-b');
      expect(issuerElemB.textContent).toContain('GBBD...FLA5');
      expect(issuerElemB.getAttribute('title')).toBe(`Canonical Asset: USDC:${issuerB}`);

      // Verify distinct issuer identifiers for same-code assets
      expect(issuerElemA.textContent).not.toBe(issuerElemB.textContent);
      expect(issuerElemA.getAttribute('title')).not.toBe(issuerElemB.getAttribute('title'));

      // Check Incomplete Metadata row (safe fallback warning)
      const amountIncomplete = screen.getByTestId('tx-amount-tx-usdc-incomplete');
      expect(amountIncomplete.textContent).toBe('+10.0000000 USDC');
      const fallbackElem = screen.getByTestId('tx-asset-fallback-tx-usdc-incomplete');
      expect(fallbackElem.textContent).toContain('unverified issuer');
      expect(fallbackElem.getAttribute('title')).toContain('missing or unverified');

      // Check Self row
      const selfDirection = screen.getByTestId('tx-direction-tx-self');
      expect(selfDirection.textContent?.toLowerCase()).toBe('self-transfer');
      const selfAmount = screen.getByTestId('tx-amount-tx-self');
      expect(selfAmount.textContent).toBe('20.0000000 XLM');

      // Check Unknown / non-transfer op row
      const unkDirection = screen.getByTestId('tx-direction-tx-unknown');
      expect(unkDirection.textContent?.toLowerCase()).toBe('unknown');
      const unkAmount = screen.getByTestId('tx-amount-tx-unknown');
      expect(unkAmount.textContent).toBe('-');
    });

    it('renders empty state when there are no transactions', () => {
      render(
        <TransactionTable
          transactions={[]}
          isLoading={false}
          error={null}
          currentPage={1}
          pageSize={10}
          totalCount={0}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
          activeAccountAddress={activeUser}
        />
      );

      expect(screen.getByText('No transactions found')).toBeDefined();
    });

    it('renders error message when error is provided', () => {
      render(
        <TransactionTable
          transactions={[]}
          isLoading={false}
          error="Network error fetching transactions"
          currentPage={1}
          pageSize={10}
          totalCount={0}
          onPageChange={vi.fn()}
          onPageSizeChange={vi.fn()}
          activeAccountAddress={activeUser}
        />
      );

      expect(screen.getByText('Network error fetching transactions')).toBeDefined();
    });
  });

  describe('TransactionTable Status Filtering', () => {
    const statusTxs: StellarTransaction[] = [
      {
        id: 'tx-conf',
        hash: '0x1111111111111111111111111111111111111111111111111111111111111111',
        ledger: 101,
        created_at: '2026-10-20T10:00:00Z',
        source_account: activeUser,
        fee_charged: '100',
        operation_count: 1,
        successful: true,
        status: 'confirmed',
        operations: [
          {
            id: 'op-1',
            type: 'payment',
            amount: '10',
            asset: 'XLM',
            from: activeUser,
            to: otherUser,
            source_account: activeUser,
          },
        ],
      },
      {
        id: 'tx-fail',
        hash: '0x2222222222222222222222222222222222222222222222222222222222222222',
        ledger: 102,
        created_at: '2026-10-20T10:05:00Z',
        source_account: activeUser,
        fee_charged: '100',
        operation_count: 1,
        successful: false,
        status: 'failed',
        operations: [
          {
            id: 'op-2',
            type: 'payment',
            amount: '20',
            asset: 'XLM',
            from: activeUser,
            to: otherUser,
            source_account: activeUser,
          },
        ],
      },
      {
        id: 'tx-pend',
        hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
        ledger: 103,
        created_at: '2026-10-20T10:10:00Z',
        source_account: activeUser,
        fee_charged: '100',
        operation_count: 1,
        successful: false,
        status: 'pending',
        operations: [
          {
            id: 'op-3',
            type: 'payment',
            amount: '30',
            asset: 'XLM',
            from: activeUser,
            to: otherUser,
            source_account: activeUser,
          },
        ],
      },
    ];

    it('renders all status options supported by the transaction contract', () => {
      render(
        <TransactionTable
          {...baseProps}
          transactions={statusTxs}
          totalCount={statusTxs.length}
        />
      );

      const statusSelect = screen.getByRole('combobox', {
        name: /filter transactions by status/i,
      });
      expect(statusSelect).toBeInTheDocument();

      const options = Array.from(statusSelect.querySelectorAll('option')).map(
        (o) => o.value
      );
      expect(options).toEqual([
        'all',
        'confirmed',
        'successful',
        'failed',
        'pending',
      ]);
    });

    it('filters for confirmed transactions when confirmed or successful is selected', () => {
      render(
        <TransactionTable
          {...baseProps}
          transactions={statusTxs}
          totalCount={statusTxs.length}
        />
      );

      const statusSelect = screen.getByRole('combobox', {
        name: /filter transactions by status/i,
      });

      fireEvent.change(statusSelect, { target: { value: 'confirmed' } });
      expect(screen.getByRole('cell', { name: /success/i })).toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: /failed/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: /pending/i })).not.toBeInTheDocument();
    });

    it('keeps pending distinct from failed transactions when filtering by failed', () => {
      render(
        <TransactionTable
          {...baseProps}
          transactions={statusTxs}
          totalCount={statusTxs.length}
        />
      );

      const statusSelect = screen.getByRole('combobox', {
        name: /filter transactions by status/i,
      });

      fireEvent.change(statusSelect, { target: { value: 'failed' } });
      expect(screen.getByRole('cell', { name: /failed/i })).toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: /pending/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: /success/i })).not.toBeInTheDocument();
    });

    it('filters for pending transactions exclusively with pending badge', () => {
      render(
        <TransactionTable
          {...baseProps}
          transactions={statusTxs}
          totalCount={statusTxs.length}
        />
      );

      const statusSelect = screen.getByRole('combobox', {
        name: /filter transactions by status/i,
      });

      fireEvent.change(statusSelect, { target: { value: 'pending' } });
      expect(screen.getByRole('cell', { name: /pending/i })).toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: /failed/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('cell', { name: /success/i })).not.toBeInTheDocument();
    });

    it('displays matching empty message when no rows match status filter without dropping pagination state', () => {
      render(
        <TransactionTable
          {...baseProps}
          transactions={[statusTxs[0]]}
          totalCount={1}
        />
      );

      const statusSelect = screen.getByRole('combobox', {
        name: /filter transactions by status/i,
      });

      fireEvent.change(statusSelect, { target: { value: 'failed' } });
      expect(
        screen.getByText('No transactions match this status on this page.')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Showing 0 matching transactions on this page (1 total)')
      ).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /per page/i })).toBeInTheDocument();
    });
  });
});
