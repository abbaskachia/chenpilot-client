import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import authService from '../auth.service';
import apiService from '../api';

describe('AuthService MFA Integration', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
    vi.restoreAllMocks();
  });

  describe('getMfaStatus', () => {
    it('returns enabled: false and supported: false when backend returns 404', async () => {
      vi.spyOn(apiService, 'getMfaStatus').mockResolvedValueOnce({
        success: false,
        status: 404,
        message: 'MFA endpoints are not currently supported by the backend service',
      });

      const status = await authService.getMfaStatus();
      expect(status.enabled).toBe(false);
      expect(status.supported).toBe(false);
    });

    it('returns enabled: true when backend authoritatively confirms MFA is enabled', async () => {
      vi.spyOn(apiService, 'getMfaStatus').mockResolvedValueOnce({
        success: true,
        data: {
          enabled: true,
          method: 'totp',
          enrolledAt: '2026-01-01T00:00:00Z',
        },
      });

      const status = await authService.getMfaStatus();
      expect(status.enabled).toBe(true);
      expect(status.supported).toBe(true);
      expect(status.method).toBe('totp');
    });

    it('handles network error safely without throwing', async () => {
      vi.spyOn(apiService, 'getMfaStatus').mockRejectedValueOnce(new Error('Network error'));

      const status = await authService.getMfaStatus();
      expect(status.enabled).toBe(false);
      expect(status.supported).toBe(false);
    });
  });

  describe('initiateMfaSetup', () => {
    it('returns enrollment details without persisting secret to localStorage', async () => {
      vi.spyOn(apiService, 'initiateMfaEnrollment').mockResolvedValueOnce({
        success: true,
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          qrCodeUrl: 'https://example.com/qr.png',
          otpAuthUri: 'otpauth://totp/ChenPilot:user?secret=JBSWY3DPEHPK3PXP',
          recoveryCodes: ['REC-1111', 'REC-2222'],
        },
      });

      const enrollment = await authService.initiateMfaSetup();

      expect(enrollment.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(enrollment.qrCodeUrl).toBe('https://example.com/qr.png');
      expect(enrollment.recoveryCodes).toEqual(['REC-1111', 'REC-2222']);

      // SECURITY: Must NEVER write secret or recovery codes to persistent storage
      expect(localStorage.getItem('mfa_secret')).toBeNull();
      expect(localStorage.getItem('mfa_recovery_codes')).toBeNull();
      expect(sessionStorage.getItem('mfa_secret')).toBeNull();
    });

    it('throws when backend rejects or does not support enrollment', async () => {
      vi.spyOn(apiService, 'initiateMfaEnrollment').mockResolvedValueOnce({
        success: false,
        status: 404,
        message: 'MFA enrollment is not currently supported by the backend service',
      });

      await expect(authService.initiateMfaSetup()).rejects.toThrow(
        /not currently supported/i
      );
    });

    it('deduplicates concurrent initiation requests using singleFlight', async () => {
      let callCount = 0;
      vi.spyOn(apiService, 'initiateMfaEnrollment').mockImplementation(async () => {
        callCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          success: true,
          data: { secret: 'SHARED-SECRET' },
        };
      });

      const [res1, res2] = await Promise.all([
        authService.initiateMfaSetup(),
        authService.initiateMfaSetup(),
      ]);

      expect(callCount).toBe(1);
      expect(res1.secret).toBe('SHARED-SECRET');
      expect(res2.secret).toBe('SHARED-SECRET');
    });
  });

  describe('verifyMfaSetup', () => {
    it('rejects invalid or non-6-digit verification code before network request', async () => {
      const apiSpy = vi.spyOn(apiService, 'verifyMfaEnrollment');

      await expect(authService.verifyMfaSetup('')).rejects.toThrow(/required/i);
      await expect(authService.verifyMfaSetup('123')).rejects.toThrow(/6 digits/i);
      await expect(authService.verifyMfaSetup('12345a')).rejects.toThrow(/6 digits/i);
      expect(apiSpy).not.toHaveBeenCalled();
    });

    it('returns enabled: true only when backend confirms successful verification', async () => {
      vi.spyOn(apiService, 'verifyMfaEnrollment').mockResolvedValueOnce({
        success: true,
        data: {
          enabled: true,
          message: 'MFA verified and enabled',
          recoveryCodes: ['CODE-A', 'CODE-B'],
        },
      });

      const result = await authService.verifyMfaSetup('123456');

      expect(result.enabled).toBe(true);
      expect(result.recoveryCodes).toEqual(['CODE-A', 'CODE-B']);

      // SECURITY: Recovery codes must NOT be stored in localStorage
      expect(localStorage.getItem('mfa_recovery_codes')).toBeNull();
      expect(localStorage.getItem('auth_token')).toBeNull(); // auth_token unaffected
    });

    it('throws and does NOT claim enabled when backend rejects code', async () => {
      vi.spyOn(apiService, 'verifyMfaEnrollment').mockResolvedValueOnce({
        success: false,
        status: 400,
        message: 'Invalid one-time verification code',
      });

      await expect(authService.verifyMfaSetup('999999')).rejects.toThrow(
        /Invalid one-time verification code/i
      );
    });

    it('throws when backend responds with enabled: false in payload', async () => {
      vi.spyOn(apiService, 'verifyMfaEnrollment').mockResolvedValueOnce({
        success: true,
        data: {
          enabled: false,
        },
      });

      await expect(authService.verifyMfaSetup('123456')).rejects.toThrow(
        /Backend did not confirm MFA enablement/i
      );
    });
  });

  describe('cancelMfaSetup', () => {
    it('cleans up transient state and ensures persistent storage is pristine', () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('mfa_secret', 'test-leak');
        sessionStorage.setItem('mfa_secret', 'test-leak');
      }

      authService.cancelMfaSetup();

      expect(localStorage.getItem('mfa_secret')).toBeNull();
      expect(sessionStorage.getItem('mfa_secret')).toBeNull();
    });
  });
});
