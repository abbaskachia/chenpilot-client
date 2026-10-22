import { describe, it, expect, vi, beforeEach } from 'vitest';
import apiService, {
  fetchAccountTrustlines,
  addTrustline,
  removeTrustline,
} from '../api';
import * as horizonModule from '@/utils/horizonFetch';

describe('Trustlines API Service', () => {
  const mockPublicKey = 'GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890123456';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetchAccountTrustlines returns trustlines from backend when successful', async () => {
    const mockData = [
      {
        assetCode: 'USDC',
        assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        balance: '100.00',
        limit: '1000000',
      },
    ];

    vi.spyOn((apiService as any).api, 'get').mockResolvedValueOnce({
      data: mockData,
    });

    const result = await apiService.fetchAccountTrustlines(mockPublicKey);
    expect(result).toEqual(mockData);
  });

  it('fetchAccountTrustlines handles wrapped ApiResponse format', async () => {
    const mockData = [
      {
        assetCode: 'AQUA',
        assetIssuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFQDUGSNsQUETOTROODBIQUMGHA',
        balance: '500.00',
        limit: '1000000',
      },
    ];

    vi.spyOn((apiService as any).api, 'get').mockResolvedValueOnce({
      data: { success: true, data: mockData },
    });

    const result = await apiService.fetchAccountTrustlines(mockPublicKey);
    expect(result).toEqual(mockData);
  });

  it('fetchAccountTrustlines falls back to horizonFetch when backend endpoint fails', async () => {
    vi.spyOn((apiService as any).api, 'get').mockRejectedValueOnce(
      new Error('Backend endpoint 404')
    );

    const horizonAccountResponse = {
      balances: [
        {
          asset_type: 'native',
          balance: '120.5000000',
        },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          balance: '25.0000000',
          limit: '1000000.0000000',
          buying_liabilities: '0.0000000',
          selling_liabilities: '0.0000000',
        },
      ],
    };

    vi.spyOn(horizonModule, 'horizonFetch').mockResolvedValueOnce({
      ok: true,
      json: async () => horizonAccountResponse,
    } as Response);

    const result = await apiService.fetchAccountTrustlines(mockPublicKey);
    expect(result).toHaveLength(1);
    expect(result[0].assetCode).toBe('USDC');
    expect(result[0].balance).toBe('25.0000000');
    expect(result[0].assetIssuer).toBe(
      'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
    );
  });

  it('addTrustline posts to /account/:publicKey/trustlines', async () => {
    const postSpy = vi
      .spyOn((apiService as any).api, 'post')
      .mockResolvedValueOnce({ data: { success: true } });

    const payload = {
      assetCode: 'USDC',
      assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      limit: '500000',
    };

    const res = await apiService.addTrustline(mockPublicKey, payload);
    expect(postSpy).toHaveBeenCalledWith(
      `/account/${mockPublicKey}/trustlines`,
      payload
    );
    expect(res).toEqual({ success: true });
  });

  it('removeTrustline sends DELETE with assetCode and assetIssuer', async () => {
    const deleteSpy = vi
      .spyOn((apiService as any).api, 'delete')
      .mockResolvedValueOnce({ data: { success: true } });

    const assetCode = 'USDC';
    const assetIssuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

    const res = await apiService.removeTrustline(
      mockPublicKey,
      assetCode,
      assetIssuer
    );
    expect(deleteSpy).toHaveBeenCalledWith(
      `/account/${mockPublicKey}/trustlines`,
      {
        data: { assetCode, assetIssuer },
      }
    );
    expect(res).toEqual({ success: true });
  });

  it('standalone functions delegate to apiService instance', async () => {
    const fetchSpy = vi
      .spyOn(apiService, 'fetchAccountTrustlines')
      .mockResolvedValueOnce([]);
    const addSpy = vi
      .spyOn(apiService, 'addTrustline')
      .mockResolvedValueOnce({ success: true });
    const removeSpy = vi
      .spyOn(apiService, 'removeTrustline')
      .mockResolvedValueOnce({ success: true });

    await fetchAccountTrustlines(mockPublicKey);
    expect(fetchSpy).toHaveBeenCalledWith(mockPublicKey);

    await addTrustline(mockPublicKey, {
      assetCode: 'USDC',
      assetIssuer: 'GABC...',
    });
    expect(addSpy).toHaveBeenCalledWith(mockPublicKey, {
      assetCode: 'USDC',
      assetIssuer: 'GABC...',
    });

    await removeTrustline(mockPublicKey, 'USDC', 'GABC...');
    expect(removeSpy).toHaveBeenCalledWith(mockPublicKey, 'USDC', 'GABC...');
  });
});
