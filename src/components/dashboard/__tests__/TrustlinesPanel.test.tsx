import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TrustlinesPanel from '../TrustlinesPanel';
import accountReducer from '@/store/slices/accountSlice';
import authReducer from '@/store/slices/authSlice';

const createTestStore = (initialAccountState = {}) => {
  return configureStore({
    reducer: {
      account: accountReducer,
      auth: authReducer,
    },
    preloadedState: {
      auth: {
        user: {
          id: 'usr_1',
          email: 'test@example.com',
          name: 'Test User',
          address: 'GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890123456',
          publicKey: 'GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890123456',
          isDeployed: true,
          isFunded: true,
          tokenType: 'XLM',
          authProvider: 'email',
          isEmailVerified: true,
          createdAt: '',
          updatedAt: '',
        },
        token: 'token',
        isAuthenticated: true,
        isLoading: false,
        error: null,
      },
      account: {
        status: {
          isDeployed: true,
          isFunded: true,
          balance: '1000',
          address: 'GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890123456',
          publicKey: 'GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890123456',
        },
        balance: null,
        transactions: { transactions: [], isLoading: false, error: null },
        isLoading: false,
        error: null,
        network: {
          status: 'healthy',
          latestLedger: 12345,
          ledgerCloseTimeMs: 1000,
          ledgerAgeSeconds: 2,
          congestion: false,
          accountSyncState: 'synced',
          lastUpdated: null,
          isLoading: false,
          error: null,
        },
        trustlines: [],
        isLoadingTrustlines: false,
        trustlinesError: null,
        ...initialAccountState,
      },
    },
  });
};

describe('TrustlinesPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the header and empty state when no trustlines are established', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <TrustlinesPanel />
      </Provider>
    );

    expect(screen.getByText('Asset Trustlines')).toBeDefined();
    expect(
      screen.getByText('No Custom Trustlines Established')
    ).toBeDefined();
  });

  it('renders established trustlines correctly', () => {
    const store = createTestStore({
      trustlines: [
        {
          assetCode: 'USDC',
          assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          balance: '250.75',
          limit: '1000000',
        },
      ],
    });

    render(
      <Provider store={store}>
        <TrustlinesPanel />
      </Provider>
    );

    expect(screen.getByText('USDC')).toBeDefined();
    expect(screen.getByText('250.75')).toBeDefined();
    expect(screen.getByText('Remove')).toBeDefined();
  });

  it('populates form inputs when clicking a preset badge', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <TrustlinesPanel />
      </Provider>
    );

    const usdcPreset = screen.getByText('USD Coin (Centre)');
    fireEvent.click(usdcPreset);

    const codeInput = screen.getByPlaceholderText('Asset Code (e.g. USDC)') as HTMLInputElement;
    const issuerInput = screen.getByPlaceholderText(
      'Issuer Public Address (G... 56 characters)'
    ) as HTMLInputElement;

    expect(codeInput.value).toBe('USDC');
    expect(issuerInput.value).toBe(
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
    );
  });

  it('warns when trying to remove trustline with non-zero balance', async () => {
    const store = createTestStore({
      trustlines: [
        {
          assetCode: 'USDC',
          assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          balance: '50.00',
          limit: '1000000',
        },
      ],
    });

    render(
      <Provider store={store}>
        <TrustlinesPanel />
      </Provider>
    );

    const removeBtn = screen.getByText('Remove');
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Cannot remove trustline for USDC: you have a remaining balance of 50.00 USDC/i)
      ).toBeDefined();
    });
  });

  it('prevents submission with invalid issuer address', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <TrustlinesPanel />
      </Provider>
    );

    const codeInput = screen.getByPlaceholderText('Asset Code (e.g. USDC)');
    const issuerInput = screen.getByPlaceholderText(
      'Issuer Public Address (G... 56 characters)'
    );
    const submitBtn = screen.getByText('Add Trustline');

    fireEvent.change(codeInput, { target: { value: 'TEST' } });
    fireEvent.change(issuerInput, { target: { value: 'INVALID_ISSUER' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Invalid Stellar issuer public key/i)
      ).toBeDefined();
    });
  });
});
