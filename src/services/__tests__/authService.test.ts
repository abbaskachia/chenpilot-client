import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import authService from '../auth.service';
import apiService from '../api';

describe('AuthService', () => {
  beforeEach(() => {
    authService.clearRecentAuthentication();
    // Clear localStorage before each test
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
  });

  afterEach(() => {
    authService.clearRecentAuthentication();
    if (typeof window !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('reauthenticate', () => {
    it('grants recent authentication only after backend verification succeeds', async () => {
      const verifyCredentials = vi
        .spyOn(apiService, 'reauthenticate')
        .mockResolvedValue();

      await authService.reauthenticate('test@example.com', 'current-password');

      expect(verifyCredentials).toHaveBeenCalledWith(
        'test@example.com',
        'current-password',
      );
      expect(authService.hasRecentAuthentication()).toBe(true);
    });

    it('does not grant access when the backend rejects the credentials', async () => {
      vi.spyOn(apiService, 'reauthenticate').mockRejectedValue(
        new Error('Invalid credentials'),
      );

      await expect(
        authService.reauthenticate('test@example.com', 'wrong-password'),
      ).rejects.toThrow('Invalid credentials');
      expect(authService.hasRecentAuthentication()).toBe(false);
    });

    it('expires the grant after five minutes', async () => {
      let now = 1_000;
      vi.spyOn(Date, 'now').mockImplementation(() => now);
      vi.spyOn(apiService, 'reauthenticate').mockResolvedValue();

      await authService.reauthenticate('test@example.com', 'current-password');
      expect(authService.hasRecentAuthentication()).toBe(true);

      now += 5 * 60 * 1000;
      expect(authService.hasRecentAuthentication()).toBe(false);
    });

    it('clears the grant when the user cancels the protected action', async () => {
      vi.spyOn(apiService, 'reauthenticate').mockResolvedValue();
      await authService.reauthenticate('test@example.com', 'current-password');

      authService.clearRecentAuthentication();

      expect(authService.hasRecentAuthentication()).toBe(false);
    });
  });

  describe('isAuthenticated', () => {
    it('returns false when no token is stored', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    it('returns true when token is stored in localStorage', () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', 'test-token');
      }
      expect(authService.isAuthenticated()).toBe(true);
    });

    it('returns false in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Simulating SSR
      delete global.window;
      expect(authService.isAuthenticated()).toBe(false);
      global.window = originalWindow;
    });
  });

  describe('getAccessToken', () => {
    it('returns null when no token is stored', () => {
      expect(authService.getAccessToken()).toBeNull();
    });

    it('returns token when stored in localStorage', () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', 'test-token-123');
      }
      expect(authService.getAccessToken()).toBe('test-token-123');
    });

    it('returns null in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Simulating SSR
      delete global.window;
      expect(authService.getAccessToken()).toBeNull();
      global.window = originalWindow;
    });
  });

  describe('getUserData', () => {
    it('returns null when no user data is stored', () => {
      expect(authService.getUserData()).toBeNull();
    });

    it('returns parsed user data when stored in localStorage', () => {
      const userData = { id: '123', email: 'test@example.com', name: 'Test User' };
      if (typeof window !== 'undefined') {
        localStorage.setItem('user_data', JSON.stringify(userData));
      }
      expect(authService.getUserData()).toEqual(userData);
    });

    it('returns null in SSR environment', () => {
      const originalWindow = global.window;
      // @ts-expect-error - Simulating SSR
      delete global.window;
      expect(authService.getUserData()).toBeNull();
      global.window = originalWindow;
    });

    it('returns typed data when generic type is specified', () => {
      interface UserData {
        id: string;
        email: string;
      }
      const userData: UserData = { id: '123', email: 'test@example.com' };
      if (typeof window !== 'undefined') {
        localStorage.setItem('user_data', JSON.stringify(userData));
      }
      const result = authService.getUserData<UserData>();
      expect(result?.email).toBe('test@example.com');
    });
  });

  describe('logout', () => {
    it('clears local state on logout', async () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', 'test-token');
        localStorage.setItem('user_data', JSON.stringify({ id: '123' }));
      }

      await authService.logout();

      expect(authService.isAuthenticated()).toBe(false);
      expect(authService.getAccessToken()).toBeNull();
    });

    it('clears auth_token from localStorage', async () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', 'test-token');
      }

      await authService.logout();

      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('clears user_data from localStorage', async () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('user_data', JSON.stringify({ id: '123' }));
      }

      await authService.logout();

      expect(localStorage.getItem('user_data')).toBeNull();
    });

    it('clears refresh_token from localStorage if present', async () => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('refresh_token', 'refresh-token');
      }

      await authService.logout();

      expect(localStorage.getItem('refresh_token')).toBeNull();
    });

    it('clears sessionStorage', async () => {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('test-key', 'test-value');
      }

      await authService.logout();

      expect(sessionStorage.length).toBe(0);
    });
  });
});
