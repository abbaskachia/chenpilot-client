import apiService, { singleFlight } from './api';

const REAUTHENTICATION_WINDOW_MS = 5 * 60 * 1000;

/**
 * Service for handling authentication-related tasks beyond basic API calls,
 * such as state persistence in local browser storage and session destruction.
 */
class AuthService {
  private recentAuthenticationAt: number | null = null;

  /**
   * Verify the user's current password and grant a short-lived security-settings gate.
   */
  async reauthenticate(email: string, password: string): Promise<void> {
    if (!email.trim()) {
      throw new Error('Email is required for re-authentication');
    }
    if (!password) {
      throw new Error('Password is required for re-authentication');
    }

    this.clearRecentAuthentication();
    await apiService.reauthenticate(email, password);
    this.recentAuthenticationAt = Date.now();
  }

  /**
   * Check whether a successful re-authentication is still within the five-minute window.
   */
  hasRecentAuthentication(): boolean {
    if (this.recentAuthenticationAt === null) return false;

    const elapsed = Date.now() - this.recentAuthenticationAt;
    if (elapsed < 0 || elapsed >= REAUTHENTICATION_WINDOW_MS) {
      this.clearRecentAuthentication();
      return false;
    }

    return true;
  }

  clearRecentAuthentication(): void {
    this.recentAuthenticationAt = null;
  }

  /**
   * Performs a logout by invalidating the session on the backend and
   * clearing all local authentication state.
   * Does NOT throw on backend errors; swallows network error so client cleanup always succeeds.
   *
   * @returns Promise resolving to void when logout cleanup completes.
   *
   * @example
   * ```ts
   * import { authService } from '@/services/auth.service';
   * 
   * await authService.logout();
   * console.log('User logged out, isAuthenticated:', authService.isAuthenticated()); // false
   * ```
   */
  async logout(): Promise<void> {
    this.clearRecentAuthentication();
    try {
      // Call the API service to perform the backend logout
      await apiService.logout();
    } catch (error) {
      console.error('AuthService.logout failed:', error);
      // We don't throw here because we want the frontend to proceed
      // with local cleanup regardless of server success.
    }
  }

  /**
   * Checks if the user is currently authenticated locally by inspecting localStorage for `auth_token`.
   * Synchronous operation; returns `false` in Server-Side Rendering (SSR) environment.
   *
   * @returns Boolean `true` if an auth token is stored in localStorage, `false` otherwise.
   */
  isAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem('auth_token');
  }

  /**
   * Gets the stored access token from browser localStorage.
   * Synchronous operation; returns `null` if window is undefined or token is missing.
   *
   * @returns JWT token string if found, or `null`.
   */
  getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  /**
   * Gets and parses stored user data object from browser localStorage.
   * Synchronous operation; returns `null` if window is undefined or data is missing/invalid.
   *
   * @template T - Target return type (defaults to unknown).
   * @returns Parsed user object of type T or `null`.
   */
  getUserData<T = unknown>(): T | null {
    if (typeof window === 'undefined') return null;
    const data = localStorage.getItem('user_data');
    return data ? JSON.parse(data) : null;
  }

  /**
   * Retrieves the current Multi-Factor Authentication (MFA) status.
   * Checks the backend for authoritative confirmation.
   * If the backend returns 404 or unsupported status, returns `{ enabled: false, supported: false }`.
   *
   * @returns Promise resolving to MFA status object.
   */
  async getMfaStatus(): Promise<{ enabled: boolean; supported: boolean; method?: 'totp' | null }> {
    try {
      const response = await apiService.getMfaStatus();
      if (response && 'success' in response && response.success && response.data) {
        return {
          enabled: !!response.data.enabled,
          supported: true,
          method: response.data.method || 'totp',
        };
      }
      return {
        enabled: false,
        supported: false,
      };
    } catch {
      // Backend error or unsupported endpoint
      return {
        enabled: false,
        supported: false,
      };
    }
  }

  /**
   * Initiates MFA enrollment by requesting enrollment secrets from the backend.
   * Uses singleFlight to prevent duplicate concurrent enrollment calls.
   *
   * IMPORTANT: The returned enrollment secrets must NEVER be written to localStorage
   * or persistent browser storage. They must remain in transient component memory only.
   *
   * @returns Promise resolving to enrollment payload containing secret and QR code.
   * @throws Error if backend fails or MFA is unsupported.
   */
  async initiateMfaSetup(): Promise<{
    secret: string;
    qrCodeUrl?: string;
    otpAuthUri?: string;
    recoveryCodes?: string[];
  }> {
    return singleFlight.run('mfa:initiate-setup', async () => {
      const response = await apiService.initiateMfaEnrollment();
      if (!response || !('success' in response) || !response.success || !response.data) {
        const errorMsg =
          ('message' in response && response.message) ||
          'Failed to initiate multi-factor authentication setup';
        throw new Error(errorMsg);
      }

      if (!response.data.secret) {
        throw new Error('Backend did not return an MFA enrollment secret');
      }

      return {
        secret: response.data.secret,
        qrCodeUrl: response.data.qrCodeUrl,
        otpAuthUri: response.data.otpAuthUri,
        recoveryCodes: response.data.recoveryCodes,
      };
    });
  }

  /**
   * Verifies an MFA enrollment code with the backend.
   * Uses singleFlight to prevent duplicate submissions.
   * Does NOT report MFA enabled unless the backend authoritatively confirms success.
   *
   * @param code - 6-digit TOTP verification code.
   * @returns Promise resolving to verification result.
   * @throws Error if code is invalid or backend verification rejects the code.
   */
  async verifyMfaSetup(code: string): Promise<{
    enabled: boolean;
    message?: string;
    recoveryCodes?: string[];
  }> {
    const trimmedCode = code ? code.trim() : '';
    if (!trimmedCode) {
      throw new Error('Verification code is required');
    }

    if (!/^\d{6}$/.test(trimmedCode)) {
      throw new Error('Verification code must be exactly 6 digits');
    }

    return singleFlight.run(`mfa:verify-setup:${trimmedCode}`, async () => {
      const response = await apiService.verifyMfaEnrollment({ code: trimmedCode });
      if (!response || !('success' in response) || !response.success || !response.data) {
        const errorMsg =
          ('message' in response && response.message) ||
          'Invalid verification code. Please check your authenticator app and try again.';
        throw new Error(errorMsg);
      }

      if (!response.data.enabled) {
        throw new Error('Backend did not confirm MFA enablement');
      }

      return {
        enabled: true,
        message: response.data.message || 'Two-factor authentication enabled successfully',
        recoveryCodes: response.data.recoveryCodes,
      };
    });
  }

  /**
   * Cancels an incomplete MFA setup flow.
   * Clears any transient state and ensures no lingering secrets or recovery codes.
   */
  cancelMfaSetup(): void {
    // In-memory operation: ensure no sensitive MFA state is leaked into persistent storage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mfa_secret');
      localStorage.removeItem('mfa_recovery_codes');
      sessionStorage.removeItem('mfa_secret');
      sessionStorage.removeItem('mfa_recovery_codes');
    }
  }
}

export const authService = new AuthService();
export default authService;
