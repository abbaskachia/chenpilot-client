import { describe, it, expect } from 'vitest';
import accountReducer, {
  setTrustlines,
  setLoadingTrustlines,
  setTrustlinesError,
  clearAccount,
  fetchTrustlines,
  addAccountTrustline,
  removeAccountTrustline,
} from '../accountSlice';
import { Trustline } from '@/types';

describe('accountSlice - Trustlines', () => {
  const mockTrustlines: Trustline[] = [
    {
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      balance: '150.5000000',
      limit: '1000000',
      assetType: 'credit_alphanum4',
    },
    {
      assetCode: 'AQUA',
      assetIssuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFQDUGSNsQUETOTROODBIQUMGHA',
      balance: '0.0000000',
      limit: '500000',
      assetType: 'credit_alphanum4',
    },
  ];

  it('should initialize with default empty trustlines state', () => {
    const state = accountReducer(undefined, { type: '@@INIT' });
    expect(state.trustlines).toEqual([]);
    expect(state.isLoadingTrustlines).toBe(false);
    expect(state.trustlinesError).toBeNull();
  });

  it('should set trustlines correctly with setTrustlines', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });
    const nextState = accountReducer(initialState, setTrustlines(mockTrustlines));

    expect(nextState.trustlines).toHaveLength(2);
    expect(nextState.trustlines[0].assetCode).toBe('USDC');
    expect(nextState.trustlines[1].assetCode).toBe('AQUA');
  });

  it('should toggle isLoadingTrustlines with setLoadingTrustlines', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });
    const loadingState = accountReducer(initialState, setLoadingTrustlines(true));
    expect(loadingState.isLoadingTrustlines).toBe(true);

    const idleState = accountReducer(loadingState, setLoadingTrustlines(false));
    expect(idleState.isLoadingTrustlines).toBe(false);
  });

  it('should set error message with setTrustlinesError', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });
    const errorState = accountReducer(
      initialState,
      setTrustlinesError('Network failure fetching trustlines')
    );
    expect(errorState.trustlinesError).toBe('Network failure fetching trustlines');
  });

  it('should clear trustlines on clearAccount', () => {
    let state = accountReducer(undefined, { type: '@@INIT' });
    state = accountReducer(state, setTrustlines(mockTrustlines));
    state = accountReducer(state, setTrustlinesError('Some error'));
    expect(state.trustlines).toHaveLength(2);

    const clearedState = accountReducer(state, clearAccount());
    expect(clearedState.trustlines).toEqual([]);
    expect(clearedState.trustlinesError).toBeNull();
  });

  it('should handle fetchTrustlines.pending', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });
    const action = { type: fetchTrustlines.pending.type };
    const state = accountReducer(initialState, action);

    expect(state.isLoadingTrustlines).toBe(true);
    expect(state.trustlinesError).toBeNull();
  });

  it('should handle fetchTrustlines.fulfilled', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });
    const action = {
      type: fetchTrustlines.fulfilled.type,
      payload: mockTrustlines,
    };
    const state = accountReducer(initialState, action);

    expect(state.isLoadingTrustlines).toBe(false);
    expect(state.trustlines).toEqual(mockTrustlines);
    expect(state.trustlinesError).toBeNull();
  });

  it('should handle fetchTrustlines.rejected', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });
    const action = {
      type: fetchTrustlines.rejected.type,
      payload: 'Horizon node timeout',
    };
    const state = accountReducer(initialState, action);

    expect(state.isLoadingTrustlines).toBe(false);
    expect(state.trustlinesError).toBe('Horizon node timeout');
  });

  it('should handle addAccountTrustline lifecycle states', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });

    // Pending
    const pendingState = accountReducer(initialState, {
      type: addAccountTrustline.pending.type,
    });
    expect(pendingState.isLoadingTrustlines).toBe(true);

    // Fulfilled
    const fulfilledState = accountReducer(pendingState, {
      type: addAccountTrustline.fulfilled.type,
    });
    expect(fulfilledState.isLoadingTrustlines).toBe(false);

    // Rejected
    const rejectedState = accountReducer(initialState, {
      type: addAccountTrustline.rejected.type,
      payload: 'Transaction rejected: op_malformed',
    });
    expect(rejectedState.isLoadingTrustlines).toBe(false);
    expect(rejectedState.trustlinesError).toBe('Transaction rejected: op_malformed');
  });

  it('should handle removeAccountTrustline lifecycle states', () => {
    const initialState = accountReducer(undefined, { type: '@@INIT' });

    // Pending
    const pendingState = accountReducer(initialState, {
      type: removeAccountTrustline.pending.type,
    });
    expect(pendingState.isLoadingTrustlines).toBe(true);

    // Fulfilled
    const fulfilledState = accountReducer(pendingState, {
      type: removeAccountTrustline.fulfilled.type,
    });
    expect(fulfilledState.isLoadingTrustlines).toBe(false);

    // Rejected
    const rejectedState = accountReducer(initialState, {
      type: removeAccountTrustline.rejected.type,
      payload: 'Cannot remove trustline with non-zero balance',
    });
    expect(rejectedState.isLoadingTrustlines).toBe(false);
    expect(rejectedState.trustlinesError).toBe(
      'Cannot remove trustline with non-zero balance'
    );
  });
});
