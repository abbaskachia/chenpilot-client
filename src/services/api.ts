import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { logger } from "../utils/logger";
import {
  RegisterRequest,
  LoginRequest,
  RegisterResponse,
  LoginResponse,
  User,
  Contact,
  CreateContactRequest,
  UpdateContactRequest,
  SendPaymentRequest,
  BalanceResponse,
  AgentQueryRequest,
  AgentQueryResponse,
  ApiResponse,
  PromptVersionRecord,
  LiquidityStats,
  LiquidityRequest,
  StellarTransaction,
  AuditLogEntry,
  AuditLogsQueryParams,
  AuditLogsResponse,
  AuditLogStats,
  MfaStatusData,
  MfaEnrollmentData,
  MfaVerifyRequest,
  MfaVerifyData,
  PaymentSubmissionResult,
  PaymentStatusResult,
} from '@/types';
import agentService from './agentService';
import { tokenRefreshService } from './tokenRefreshService';
import {
  isRetryableError,
  computeBackoffMs,
  sleep,
  incrementRetryCount,
  retryLabel,
} from '@/utils/retryUtils';
import { buildPaymentIdempotencyKey } from '@/utils/paymentIdempotency';
import { PaymentOutcomeUnknownError, isPaymentOutcomeUnknown } from '@/utils/paymentOutcome';

const FRIENDTEST_URL = 'https://friendbot.stellar.org';

/**
 * Narrowly-scoped single-flight guard for keyed asynchronous work.
 *
 * While a key is in flight, additional calls for the same key reuse the pending
 * promise instead of issuing a duplicate request. The entry is released on both
 * success and failure, so a failed attempt never blocks a later retry.
 *
 * The guard deliberately lives outside React state: two clicks dispatched in
 * the same tick must be deduplicated even though no re-render has happened yet,
 * and `finally`-style cleanup cannot be skipped by an unmount.
 */
export class SingleFlight {
  private inFlight = new Map<string, Promise<unknown>>();

  isInFlight(key: string): boolean {
    return this.inFlight.has(key);
  }

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key) as Promise<T> | undefined;
    if (pending) {
      return pending;
    }

    const promise = Promise.resolve().then(task);
    this.inFlight.set(key, promise);
    const release = () => {
      if (this.inFlight.get(key) === promise) {
        this.inFlight.delete(key);
      }
    };
    promise.then(release, release);

    return promise;
  }
}

export const singleFlight = new SingleFlight();

export interface FundingResult {
  success: boolean;
  message: string;
  txHash?: string;
}

export const requestAccountFunding = async (
  publicKey: string,
  requiredAmount: number,
  currentBalance: number,
  isTestnet: boolean
): Promise<FundingResult> => {
  if (currentBalance >= requiredAmount) {
    return {
      success: true,
      message: `Account is already sufficiently funded (${currentBalance} XLM >= required ${requiredAmount} XLM).`,
    };
  }

  try {
    // 1. Attempt primary backend funding endpoint
    const response = await axios.post('/api/fund', { publicKey, requiredAmount });
    return {
      success: true,
      message: 'Account funded successfully via backend service.',
      txHash: response.data.txHash,
    };
  } catch (backendError: unknown) {
    // If on testnet, fallback to Stellar Friendbot
    if (isTestnet) {
      try {
        const friendbotResponse = await axios.get(`${FRIENDTEST_URL}/?addr=${publicKey}`);
        return {
          success: true,
          message: 'Account funded successfully via Stellar Testnet Friendbot fallback.',
          txHash: friendbotResponse.data.hash,
        };
      } catch {
        throw new Error(
          `Funding failed: Backend service unavailable and Friendbot fallback failed. Required: ${requiredAmount} XLM, Current: ${currentBalance} XLM.`
        );
      }
    }

    // Translate backend error into actionable message
    const statusCode = backendError.response?.status;
    if (statusCode === 429) {
      throw new Error(`Funding rate limit exceeded. Required: ${requiredAmount} XLM. Please try again later.`);
    } else if (statusCode === 400) {
      throw new Error(`Invalid funding request. Required balance: ${requiredAmount} XLM, Current: ${currentBalance} XLM.`);
    } else {
      throw new Error(
        `Failed to fund account. Required: ${requiredAmount} XLM, Current: ${currentBalance} XLM. Please check your network connection.`
      );
    }
  }
};

// ─── Lazy store reference ─────────────────────────────────────────────────────
// We use a lazy injection pattern instead of a direct import to avoid the
// circular dependency:  store → authSlice → api → store.
// Call apiService.setStore(store) once in your store initialisation.

type MinimalStore = {
  dispatch: (action: { type: string; payload?: unknown }) => void;
};

let _store: MinimalStore | null = null;

interface PaymentRequestConfig extends AxiosRequestConfig {
  paymentOperation?: boolean;
}

/**
 * Main API service handling HTTP requests, authentication state,
 * error retries, background token refreshes, and backend integrations.
 */
class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    // ── Fix: load persisted token immediately so the first request after a
    // page refresh is already authenticated without waiting for Redux hydration.
    this.loadTokenFromStorage();

    this.api = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2333',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // ── Interceptor 1: attach bearer token to every outgoing request ─────────
    this.api.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // ── Interceptor 2: transient-error retry with exponential backoff ─────────
    // Registered before the auth interceptor so 401s still reach the
    // token-refresh logic unmodified. Non-retryable errors pass straight
    // through to interceptor 3.
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        if (!isRetryableError(error)) {
          return Promise.reject(error);
        }

        const attempt = incrementRetryCount(originalRequest);
        const delayMs = computeBackoffMs(attempt - 1, error);
        const label   = retryLabel(error);

        // Notify the UI so a status banner can be shown.
        if (_store) {
          _store.dispatch({
            type: 'ui/setRetryStatus',
            payload: {
              label,
              attempt,
              maxAttempts: 3, // RETRY_CONFIG.MAX_ATTEMPTS — kept inline to avoid
              nextRetryAt: Date.now() + delayMs, // circular dep issues in tests
            },
          });
        }

        await sleep(delayMs);

        // Clear the status right before the re-attempt so the banner
        // disappears once the request is back in-flight.
        if (_store) {
          _store.dispatch({ type: 'ui/clearRetryStatus' });
        }

        return this.api(originalRequest);
      },
    );

    // ── Interceptor 3: queued token refresh on 401 ────────────────────────────
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Non-401 errors, or a request that already tried refresh, reject.
        if (error.response?.status !== 401 || originalRequest._retry) {
          if (error.response?.status === 401) {
            this.clearToken();
            if (typeof window !== 'undefined') {
              window.location.href = '/auth/login';
            }
          }
          return Promise.reject(error);
        }

        // Mark so this particular request only retries once.
        originalRequest._retry = true;

        try {
          // tokenRefreshService serialises concurrent refresh calls:
          // the first 401 does the real HTTP POST; every subsequent concurrent
          // 401 queues here and waits. All resolve together with the new token.
          const { token: newToken } = await tokenRefreshService.refreshToken(
            this.api.defaults.baseURL as string,
          );

          // Keep ApiService, localStorage, AND Redux in sync.
          this.setToken(newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;

          if (_store) {
            _store.dispatch({ type: 'auth/setToken', payload: newToken });
          }

          return this.api(originalRequest);
        } catch (refreshError) {
          // Refresh failed (e.g. refresh token itself expired) → log out.
          this.clearToken();
          if (_store) {
            _store.dispatch({ type: 'auth/clearAuth' });
          }
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/login';
          }
          return Promise.reject(refreshError);
        }
      },
    );
  }

  /**
   * Inject the Redux store reference to avoid circular imports.
   * Call this once after the store is created (e.g. in src/store/index.ts).
   *
   * @param store - Minimal Redux store reference with dispatch capability.
   */
  setStore(store: MinimalStore): void {
    _store = store;
  }

  /**
   * Set and persist the JWT authentication token in memory and browser localStorage.
   *
   * @param token - Bearer JWT token string.
   */
  setToken(token: string): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  /**
   * Clear the active JWT authentication token from memory and browser localStorage.
   */
  clearToken(): void {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  /**
   * Load the active JWT authentication token from browser localStorage into memory if present.
   */
  loadTokenFromStorage(): void {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        this.token = token;
      }
    }
  }

  // Authentication endpoints

  /**
   * Register a new user account.
   *
   * @param data - Registration details including email, password, and optional name.
   * @returns Promise resolving to `RegisterResponse` containing registration result and optional token.
   * @throws {Error} Throws an Error if data validation fails (e.g., missing email or password) or HTTP request fails.
   */
  async register(data: RegisterRequest): Promise<RegisterResponse> {
    // Validate input data before processing
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid registration data');
    }
    
    if (!data.email || typeof data.email !== 'string') {
      throw new Error('Email is required and must be a string');
    }
    
    if (!data.password || typeof data.password !== 'string') {
      throw new Error('Password is required and must be a string');
    }
    
    if (data.name && typeof data.name !== 'string') {
      throw new Error('Name must be a string if provided');
    }
    
    const response = await this.api.post<RegisterResponse>('/auth/register', data);
    // Persist token on successful registration to keep the user authenticated
    if (response.data?.success && (response.data as { data?: { token?: string } })?.data?.token) {
      this.setToken((response.data as { data: { token: string } }).data.token);
    }
    return response.data;
  }

  /**
   * Verify current credentials without changing the active session token.
   */
  async reauthenticate(email: string, password: string): Promise<void> {
    const response = await axios.post<LoginResponse>(
      this.api.getUri({ url: '/auth/login' }),
      { email, password },
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Re-authentication failed');
    }
  }

  /**
   * Authenticate a user using email and password.
   *
   * @param data - Login credentials containing email and password.
   * @returns Promise resolving to `LoginResponse` containing token and user profile data.
   * @throws {Error} Throws an Error if input validation fails or if network/auth request fails.
   */
  async login(data: LoginRequest): Promise<LoginResponse> {
    // Validate input data before processing
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid login data');
    }
    
    if (!data.email || typeof data.email !== 'string') {
      throw new Error('Email is required and must be a string');
    }
    
    if (!data.password || typeof data.password !== 'string') {
      throw new Error('Password is required and must be a string');
    }
    
    const response = await this.api.post<LoginResponse>('/auth/login', data);
    if (response.data.success && response.data.data.token) {
      this.setToken(response.data.data.token);
    }
    return response.data;
  }

  /**
   * Authenticate with Google OAuth ID token.
   *
   * @param token - Google OAuth ID token string.
   * @returns Promise resolving to `LoginResponse`.
   * @throws {AxiosError} Throws if Google authentication request fails.
   */
  async googleAuth(token: string): Promise<LoginResponse> {
    const response = await this.api.post<LoginResponse>('/auth/google-auth', { token });
    if (response.data.success && response.data.data.token) {
      this.setToken(response.data.data.token);
    }
    return response.data;
  }

  /**
   * Verify email address using verification token.
   *
   * @param token - Email verification token string.
   * @returns Promise resolving to standard ApiResponse envelope with message.
   * @throws {AxiosError} Throws if verification token is invalid or request fails.
   */
  async verifyEmail(token: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.get<ApiResponse<{ message: string }>>(`/auth/verify-email/${token}`);
    return response.data;
  }

  /**
   * Resend verification email to user.
   *
   * @param email - Target user email address string.
   * @returns Promise resolving to standard ApiResponse envelope.
   * @throws {AxiosError} Throws if request fails.
   */
  async resendVerification(email: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<ApiResponse<{ message: string }>>('/auth/resend-verification', { email });
    return response.data;
  }

  /**
   * Request password reset email for an account.
   *
   * @param email - User email address string.
   * @returns Promise resolving to standard ApiResponse envelope.
   * @throws {AxiosError} Throws if request fails.
   */
  async forgotPassword(email: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<ApiResponse<{ message: string }>>('/auth/forgot-password', { email });
    return response.data;
  }

  /**
   * Reset user password using token received via email.
   *
   * @param token - Password reset token string.
   * @param password - New user password string.
   * @returns Promise resolving to standard ApiResponse envelope.
   * @throws {AxiosError} Throws if token is invalid or request fails.
   */
  async resetPassword(token: string, password: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<ApiResponse<{ message: string }>>(`/auth/reset-password/${token}`, { password });
    return response.data;
  }

  /**
   * Logout user by invalidating backend session and purging all local auth state.
   * Never throws errors; catches backend failures and ensures local token/storage cleanup.
   *
   * @returns Promise resolving when logout cleanup completes.
   */
  async logout(): Promise<void> {
    try {
      // Send the request to invalidate the refresh token on the backend
      // Using withCredentials: true ensures cookies (if used) are sent
      await this.api.post('/auth/logout', {}, { withCredentials: true });
    } catch (error) {
      // Even if logout fails on server, clear local state
      console.warn('Logout request failed, clearing local state anyway', error);
    } finally {
      this.clearToken();
      // Purge all auth-related data from storage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('user_data');
        localStorage.removeItem('refresh_token'); // Clear refresh token if stored here
        sessionStorage.clear(); // Clear session storage as well
      }
    }
  }

  /**
   * Explicitly refresh current authentication token using bare Axios POST request.
   *
   * @returns Promise resolving to object containing new JWT token string.
   * @throws {AxiosError} Throws if token refresh endpoint fails.
   */
  async refreshToken(): Promise<{ token: string }> {
    // Use a bare axios call (not this.api) to avoid triggering the response
    // interceptor recursively on a 401 from the refresh endpoint itself.
    const response = await axios.post<{ token: string }>(
      `${this.api.defaults.baseURL}/auth/refresh`,
      {},
      {
        headers: { 'Content-Type': 'application/json' },
        // ── Fix: forward cookies so the server can read the httpOnly
        // refresh-token cookie it set at login time.
        withCredentials: true,
      },
    );

    if (response.data?.token) {
      this.setToken(response.data.token);
    }
    return response.data;
  }

  // Protected endpoints

  /**
   * Retrieve current authenticated user details from `/auth/me`.
   *
   * @returns Promise resolving to `ApiResponse<User>`.
   * @throws {AxiosError} Throws if unauthenticated or request fails.
   */
  async getMe(): Promise<ApiResponse<User>> {
    const response = await this.api.get<ApiResponse<User>>('/auth/me');
    return response.data;
  }

  /**
   * Retrieve user profile details from `/auth/profile`.
   *
   * @returns Promise resolving to `ApiResponse<User>`.
   * @throws {AxiosError} Throws if request fails.
   */
  async getProfile(): Promise<ApiResponse<User>> {
    const response = await this.api.get<ApiResponse<User>>('/auth/profile');
    return response.data;
  }

  /**
   * Update authenticated user profile fields.
   *
   * @param data - Partial `User` data object to update.
   * @returns Promise resolving to updated `ApiResponse<User>`.
   * @throws {AxiosError} Throws if update fails.
   */
  async updateProfile(data: Partial<User>): Promise<ApiResponse<User>> {
    const response = await this.api.put<ApiResponse<User>>('/auth/profile', data);
    return response.data;
  }

  /**
   * Change password for currently logged-in user.
   *
   * @param currentPassword - Existing account password string.
   * @param newPassword - New password string.
   * @returns Promise resolving to standard ApiResponse envelope with status message.
   * @throws {AxiosError} Throws if current password is incorrect or request fails.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<ApiResponse<{ message: string }>>('/auth/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  /**
   * Delete user account permanently and clear stored authentication token.
   *
   * @returns Promise resolving to standard ApiResponse envelope.
   * @throws {AxiosError} Throws if deletion request fails.
   */
  async deleteAccount(): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.delete<ApiResponse<{ message: string }>>('/auth/account');
    this.clearToken();
    return response.data;
  }

  /**
   * Export all user data as a binary file Blob.
   * Iterates through candidate endpoints (`/data-export`, `/data/export`, `/api/data-export`).
   *
   * @returns Promise resolving to downloadable `Blob`.
   * @throws {Error} Throws Error if user data export endpoint is not found or fails.
   */
  async exportUserData(): Promise<Blob> {
    const endpoints = ['/data-export', '/data/export', '/api/data-export'];

    for (const endpoint of endpoints) {
      try {
        const response = await this.api.get<Blob>(endpoint, {
          responseType: 'blob',
        });

        if (response.status === 200 && response.data) {
          return response.data;
        }
      } catch (error: unknown) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          continue; // try next endpoint
        }
        throw error;
      }
    }

    throw new Error('User data export endpoint not found.');
  }

  // Starknet account management

  /**
   * Deploy Starknet user account smart contract.
   *
   * @returns Promise resolving to `ApiResponse` containing transaction hash and contract address.
   * @throws {AxiosError} Throws if contract deployment fails.
   */
  async deployAccount(): Promise<ApiResponse<{ transactionHash: string; contractAddress: string }>> {
    const response = await this.api.post<ApiResponse<{ transactionHash: string; contractAddress: string }>>('/auth/starknet/deploy');
    return response.data;
  }

  /**
   * Retrieve Starknet account balance breakdown.
   *
   * @returns Promise resolving to `BalanceResponse`.
   * @throws {AxiosError} Throws if balance request fails.
   */
  async getBalance(): Promise<BalanceResponse> {
    const response = await this.api.get<BalanceResponse>('/auth/starknet/balance');
    return response.data;
  }

  /**
   * Check deployment and funding status of Starknet account.
   *
   * @returns Promise resolving to `ApiResponse` with deployment state flags and address details.
   * @throws {AxiosError} Throws if status query fails.
   */
  async getAccountStatus(): Promise<ApiResponse<{ isDeployed: boolean; isFunded: boolean; address: string; publicKey: string }>> {
    const response = await this.api.get<ApiResponse<{ isDeployed: boolean; isFunded: boolean; address: string; publicKey: string }>>('/auth/starknet/status');
    return response.data;
  }

  // Auto-funding

  /**
   * Trigger account funding via auto-faucet.
   *
   * @returns Promise resolving to `ApiResponse` containing transaction hash and funded amount string.
   * @throws {AxiosError} Throws if funding request fails.
   */
  async fundAccount(): Promise<ApiResponse<{ transactionHash: string; amount: string }>> {
    const response = await this.api.post<ApiResponse<{ transactionHash: string; amount: string }>>('/auth/funding/fund-account');
    return response.data;
  }

  /**
   * Retrieve global auto-funding statistics.
   *
   * @returns Promise resolving to `ApiResponse` with total funded count, total accounts, and average amount.
   * @throws {AxiosError} Throws if statistics request fails.
   */
  async getAutoFundingStats(): Promise<ApiResponse<{ totalFunded: number; totalAccounts: number; averageAmount: string }>> {
    const response = await this.api.get<ApiResponse<{ totalFunded: number; totalAccounts: number; averageAmount: string }>>('/auth/funding/auto-funding-stats');
    return response.data;
  }

  /**
   * Fetch current funded account balance state.
   *
   * @returns Promise resolving to `ApiResponse` with balance string and boolean flag.
   * @throws {AxiosError} Throws if request fails.
   */
  async getFundedAccountBalance(): Promise<ApiResponse<{ balance: string; hasBalance: boolean }>> {
    const response = await this.api.get<ApiResponse<{ balance: string; hasBalance: boolean }>>('/auth/funding/funded-account-balance');
    return response.data;
  }

  /**
   * Batch fund multiple account balances with an array of amounts.
   *
   * @param amounts - Array of numerical amount strings.
   * @returns Promise resolving to `ApiResponse` with array of transaction hashes and total funded amount.
   * @throws {AxiosError} Throws if batch funding fails.
   */
  async batchFund(amounts: string[]): Promise<ApiResponse<{ transactionHashes: string[]; totalAmount: string }>> {
    const response = await this.api.post<ApiResponse<{ transactionHashes: string[]; totalAmount: string }>>('/auth/funding/batch-fund', { amounts });
    return response.data;
  }

  // Account transaction endpoints

  /**
   * Retrieve paginated transaction history for a user account.
   *
   * @param userId - Target user identifier string.
   * @param page - Page index (1-based, defaults to 1).
   * @param limit - Page size limit (defaults to 10).
   * @returns Promise resolving to `ApiResponse` containing Stellar transactions array and pagination meta.
   * @throws {AxiosError} Throws if transaction lookup fails.
   */
  async getAccountTransactions(userId: string, page: number = 1, limit: number = 10): Promise<ApiResponse<{ transactions: StellarTransaction[]; total: number; page: number; limit: number }>> {
    const response = await this.api.get<ApiResponse<{ transactions: StellarTransaction[]; total: number; page: number; limit: number }>>(`/account/${userId}/transactions`, {
      params: { page, limit }
    });
    return response.data;
  }

  async sendPayment(
    payment: SendPaymentRequest,
    idempotencyKey: string,
  ): Promise<PaymentSubmissionResult> {
    try {
      const response = await this.api.post<PaymentSubmissionResult>('/payments', payment, {
        headers: { 'Idempotency-Key': idempotencyKey },
        paymentOperation: true,
      } as PaymentRequestConfig);
      const payload = response.data as PaymentSubmissionResult | ApiResponse<PaymentSubmissionResult>;
      if ('success' in payload) {
        if (!payload.success) throw new Error(payload.message || 'Payment submission failed.');
        return payload.data;
      }
      return payload;
    } catch (error) {
      if (isPaymentOutcomeUnknown(error)) {
        throw new PaymentOutcomeUnknownError(
          'We could not confirm whether the payment was submitted. Check its status before taking any further action.',
        );
      }
      throw error;
    }
  }

  async getPaymentStatus(idempotencyKey: string): Promise<PaymentStatusResult> {
    const response = await this.api.get<PaymentStatusResult>('/payments/status', {
      params: { idempotencyKey },
    });
    const payload = response.data as PaymentStatusResult | ApiResponse<PaymentStatusResult>;
    if ('success' in payload) {
      if (!payload.success) throw new Error(payload.message || 'Payment status is unavailable.');
      return payload.data;
    }
    return payload;
  }

  // Contact management - Note: Contact endpoints are not available in experimental backend
  // Contact management is handled through the agent query system

  /**
   * Retrieve list of user contacts.
   * Catches HTTP 404 error if experimental backend lacks contact endpoints and resolves to fallback envelope instead of throwing.
   *
   * @returns Promise resolving to `ApiResponse<Contact[]>`.
   * @throws {AxiosError} Throws for non-404 errors.
   */
  async getContacts(): Promise<ApiResponse<Contact[]>> {
    try {
      const response = await this.api.get<ApiResponse<Contact[]>>('/contacts');
      return response.data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        // Contact endpoints not available in experimental backend
        return {
          success: true,
          data: [],
          message: 'Contact management is available through the chat interface'
        };
      }
      throw error;
    }
  }

  /**
   * Create a new contact.
   * Catches 404 status from experimental backend and returns fallback response envelope with 404 code instead of throwing.
   *
   * @param data - `CreateContactRequest` payload.
   * @returns Promise resolving to `ApiResponse<Contact>`.
   * @throws {AxiosError} Throws for non-404 errors.
   */
  async createContact(data: CreateContactRequest): Promise<ApiResponse<Contact>> {
    try {
      const response = await this.api.post<ApiResponse<Contact>>('/contacts', data);
      return response.data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        // Contact endpoints not available in experimental backend
        return {
          success: false,
          status: 404,
          message: 'Contact creation is available through the chat interface. Try: "Add John as a contact with address 0x123..."'
        };
      }
      throw error;
    }
  }

  /**
   * Update an existing contact by ID.
   * Catches 404 status from experimental backend and returns fallback response envelope with 404 code instead of throwing.
   *
   * @param id - Contact identifier string.
   * @param data - `UpdateContactRequest` payload.
   * @returns Promise resolving to `ApiResponse<Contact>`.
   * @throws {AxiosError} Throws for non-404 errors.
   */
  async updateContact(id: string, data: UpdateContactRequest): Promise<ApiResponse<Contact>> {
    try {
      const response = await this.api.put<ApiResponse<Contact>>(`/contacts/${id}`, data);
      return response.data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        // Contact endpoints not available in experimental backend
        return {
          success: false,
          status: 404,
          message: 'Contact updates are available through the chat interface'
        };
      }
      throw error;
    }
  }

  /**
   * Delete contact by ID.
   * Catches 404 status from experimental backend and returns fallback response envelope with 404 code instead of throwing.
   *
   * @param id - Contact identifier string.
   * @returns Promise resolving to `ApiResponse<{ message: string }>`.
   * @throws {AxiosError} Throws for non-404 errors.
   */
  async deleteContact(id: string): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.api.delete<ApiResponse<{ message: string }>>(`/contacts/${id}`);
      return response.data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        // Contact endpoints not available in experimental backend
        return {
          success: false,
          status: 404,
          message: 'Contact deletion is available through the chat interface. Try: "Remove John from my contacts"'
        };
      }
      throw error;
    }
  }

  /**
   * Submit a payment using a deterministic idempotency key so rapid duplicate
   * clicks retry the same request rather than creating duplicate transfers.
   */
  async sendPayment(data: SendPaymentRequest): Promise<ApiResponse<{ paymentId: string; status: string }>> {
    const idempotencyKey = data.idempotencyKey || buildPaymentIdempotencyKey(data);

    const response = await this.api.post<ApiResponse<{ paymentId: string; status: string }>>('/payments', {
      ...data,
      idempotencyKey,
    }, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });

    return response.data;
  }

  // Agent query - Optimized for backend integration

  /**
   * Send a query to the AI agent. Attempts connected experimental agent service first, falling back to backend `/query`.
   * Does NOT throw on backend/execution error; catches exceptions and returns a resolved `AgentQueryResponse` object with `success: false` and friendly message.
   *
   * @param data - Request payload containing user query string.
   * @returns Promise resolving to `AgentQueryResponse` containing result envelope.
   *
   * @example
   * ```ts
   * import { apiService } from '@/services/api';
   * 
   * const response = await apiService.queryAgent({ query: 'Swap 10 XLM for USDC' });
   * if (response.result.success) {
   *   console.log('Agent output:', response.result.data);
   * } else {
   *   console.error('Agent query error:', response.result.error);
   * }
   * ```
   */
  async queryAgent(data: AgentQueryRequest, options?: { signal?: AbortSignal }): Promise<AgentQueryResponse> {
    const isAbort = (error: unknown) => {
      const axiosError = error as { code?: string; name?: string };
      return (
        axiosError.code === 'ERR_CANCELED' ||
        axiosError.name === 'CanceledError' ||
        axiosError.name === 'AbortError'
      );
    };

    // First try the experimental agent service
    try {
      if (agentService.isAgentConnected()) {
        logger.debug('[ApiService] Using experimental agent service');
        return await agentService.queryAgent(data, options);
      }
    } catch (error) {
      if (isAbort(error)) throw error;
      console.warn('[ApiService] Experimental agent service failed, falling back to backend:', error);
    }

    // Fallback to backend API (experimental backend)
    try {
      if (!data.query || data.query.trim().length === 0) {
        throw new Error('Query cannot be empty');
      }

      logger.debug('[ApiService] Querying backend /query endpoint');
      const response = await this.api.post('/query', data, { signal: options?.signal });
      
      // The system returns response.data directly or wrapped in { result: ... }
      if (response.data && response.data.result) {
        return {
          result: {
            success: response.data.result.success ?? true,
            data: response.data.result.data || 'Success',
            error: response.data.result.error,
            executionTrace: response.data.result.executionTrace
          }
        };
      }
      
      // Handle the case where the backend returns the result directly
      return {
        result: {
          success: true,
          data: typeof response.data === 'string' ? response.data : JSON.stringify(response.data),
          error: undefined
        }
      };
    } catch (error: unknown) {
      if (isAbort(error)) throw error;
      console.error('[ApiService] Backend query failed:', error);
      // Convert technical errors to user-friendly messages
      let friendlyMessage = 'Query failed. Please try again.';
      const errorMsg = (error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message || (error as { message?: string }).message || 'Unknown error';
      
      if (errorMsg.includes('invalid query')) {
        friendlyMessage = "I didn't understand that. Could you please rephrase your question?";
      } else if (errorMsg.includes('timeout')) {
        friendlyMessage = "The request is taking longer than expected. Please try again.";
      } else if (errorMsg.includes('network')) {
        friendlyMessage = "I'm having trouble connecting. Please check your internet connection and try again.";
      }

      return {
        result: {
          success: false,
          data: friendlyMessage,
          error: errorMsg
        }
      };
    }
  }

  // Agent-specific methods

  /**
   * Retrieve agent status summary. Does NOT throw on failure; returns default offline status object if underlying call fails.
   *
   * @returns Promise resolving to agent status object.
   */
  async getAgentStatus() {
    try {
      return await agentService.getStatus();
    } catch (error) {
      console.error('Failed to get agent status:', error);
      // Return a default status instead of throwing
      return {
        isOnline: false,
        version: '1.0.0',
        uptime: 0,
        lastActivity: new Date().toISOString(),
        activeConnections: 0,
        services: {
          vesu: { isActive: false, isHealthy: false, lastCheck: new Date().toISOString() },
          atomiq: { isActive: false, isHealthy: false, lastCheck: new Date().toISOString() },
          xverse: { isActive: false, isHealthy: false, lastCheck: new Date().toISOString() },
          troves: { isActive: false, isHealthy: false, lastCheck: new Date().toISOString() },
          database: { isActive: false, isHealthy: false, lastCheck: new Date().toISOString() }
        }
      };
    }
  }

  /**
   * Retrieve agent capabilities configuration. Does NOT throw on failure; returns default empty capabilities object on error.
   *
   * @returns Promise resolving to agent capabilities object.
   */
  async getAgentCapabilities() {
    try {
      return await agentService.getCapabilities();
    } catch (error) {
      console.error('Failed to get agent capabilities:', error);
      // Return default capabilities instead of throwing
      return {
        supportedActions: [],
        supportedAssets: [],
        supportedProtocols: [],
        features: {
          defi: false,
          crossChain: false,
          voiceCommands: false,
          smartContracts: false,
          yieldFarming: false,
          lending: false,
          borrowing: false,
          swapping: false
        },
        limits: {
          maxQueryLength: 0,
          maxConcurrentQueries: 0,
          rateLimitPerMinute: 0
        }
      };
    }
  }

  /**
   * Perform direct health check on agent service.
   *
   * @returns Promise resolving to health check status object.
   * @throws Throws error if agent service health check fails.
   */
  async checkAgentHealth() {
    try {
      return await agentService.healthCheck();
    } catch (error) {
      console.error('Failed to check agent health:', error);
      throw error;
    }
  }

  /**
   * Retrieve available agent tools list. Does NOT throw on failure; returns empty array on error.
   *
   * @returns Promise resolving to tools array.
   */
  async getAgentTools() {
    try {
      return await agentService.getTools();
    } catch (error) {
      console.error('Failed to get agent tools:', error);
      return [];
    }
  }

  /**
   * Execute specified agent tool with parameters.
   *
   * @param toolName - Identifier of tool to execute.
   * @param params - Parameter payload object for the tool execution.
   * @returns Promise resolving to tool execution output.
   * @throws Throws error if tool execution fails.
   */
  async executeAgentTool(toolName: string, params: Record<string, unknown>) {
    try {
      return await agentService.executeTool(toolName, params);
    } catch (error) {
      console.error(`Failed to execute agent tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Retrieve stored agent memory records for a given user. Does NOT throw on failure; returns empty array on error.
   *
   * @param userId - User ID string.
   * @returns Promise resolving to array of memory record strings.
   */
  async getAgentMemory(userId: string) {
    try {
      return await agentService.getMemory(userId);
    } catch (error) {
      console.error('Failed to get agent memory:', error);
      return [];
    }
  }

  /**
   * Clear agent stored memory records for a given user.
   *
   * @param userId - User ID string.
   * @returns Promise resolving to void.
   * @throws Throws error if memory clear operation fails.
   */
  async clearAgentMemory(userId: string) {
    try {
      await agentService.clearMemory(userId);
    } catch (error) {
      console.error('Failed to clear agent memory:', error);
      throw error;
    }
  }

  // Chat endpoints - Removed server-side conversation management
  // All conversation and message management is now handled client-side

  // Removed: getOrCreateActiveConversation - now handled client-side

  /**
   * Fetch conversation statistics from server.
   *
   * @returns Promise resolving to `ApiResponse` with conversation counts.
   * @throws {AxiosError} Throws if request fails.
   */
  async getConversationStats(): Promise<ApiResponse<{ totalConversations: number; totalMessages: number; activeConversations: number }>> {
    const response = await this.api.get<ApiResponse<{ totalConversations: number; totalMessages: number; activeConversations: number }>>('/chat/stats');
    return response.data;
  }

  /**
   * Retrieve prompt version records.
   *
   * @returns Promise resolving to array or single `PromptVersionRecord` or `ApiResponse`.
   * @throws {AxiosError} Throws if request fails.
   */
  async getPromptVersions(): Promise<PromptVersionRecord[] | ApiResponse<PromptVersionRecord[]> | PromptVersionRecord> {
    const response = await this.api.get<PromptVersionRecord[] | ApiResponse<PromptVersionRecord[]> | PromptVersionRecord>('/versions');
    return response.data;
  }

  /**
   * Activate prompt version by version ID.
   *
   * @param id - Version ID string.
   * @returns Promise resolving to `ApiResponse<PromptVersionRecord>` or `PromptVersionRecord`.
   * @throws {AxiosError} Throws if activation fails.
   */
  async activatePromptVersion(id: string): Promise<ApiResponse<PromptVersionRecord> | PromptVersionRecord> {
    const response = await this.api.patch<ApiResponse<PromptVersionRecord> | PromptVersionRecord>(`/versions/${id}/activate`);
    return response.data;
  }

  // Liquidity Pool endpoints

  /**
   * Retrieve liquidity pool statistics.
   *
   * @param request - Optional `LiquidityRequest` filters.
   * @returns Promise resolving to `ApiResponse<LiquidityStats>`.
   * @throws {AxiosError} Throws if request fails.
   */
  async getLiquidityStats(request?: LiquidityRequest): Promise<ApiResponse<LiquidityStats>> {
    const response = await this.api.post<ApiResponse<LiquidityStats>>('/liquidity', request || {});
    return response.data;
  }

  // === Audit Log Endpoints ===

  /**
   * Fetch audit logs with filtering, pagination, and search parameters.
   *
   * @param params - Optional `AuditLogsQueryParams` filtering object.
   * @returns Promise resolving to `AuditLogsResponse`.
   * @throws {AxiosError} Throws if request fails.
   */
  async getAuditLogs(params: AuditLogsQueryParams = {}): Promise<AuditLogsResponse> {
    const response = await this.api.get<AuditLogsResponse>('/audit', { params });
    return response.data;
  }

  /**
   * Fetch a single audit log entry by ID.
   *
   * @param id - Audit log entry ID string.
   * @returns Promise resolving to `ApiResponse<AuditLogEntry>`.
   * @throws {AxiosError} Throws if audit log entry is not found or request fails.
   */
  async getAuditLogById(id: string): Promise<ApiResponse<AuditLogEntry>> {
    const response = await this.api.get<ApiResponse<AuditLogEntry>>(`/audit/${id}`);
    return response.data;
  }

  /**
   * Fetch aggregated audit log statistics.
   *
   * @returns Promise resolving to `ApiResponse<AuditLogStats>`.
   * @throws {AxiosError} Throws if request fails.
   */
  async getAuditLogStats(): Promise<ApiResponse<AuditLogStats>> {
    const response = await this.api.get<ApiResponse<AuditLogStats>>('/audit/stats');
    return response.data;
  }

  /**
   * Export audit logs as downloadable Blob (CSV/JSON).
   *
   * @param params - Optional `AuditLogsQueryParams` export filter parameters.
   * @returns Promise resolving to binary file `Blob`.
   * @throws {AxiosError} Throws if export request fails.
   */
  async exportAuditLogs(params: AuditLogsQueryParams = {}): Promise<Blob> {
    const response = await this.api.get<Blob>('/audit/export', {
      params,
      responseType: 'blob',
    });
    return response.data;
  }

  /**
   * Fetch current MFA status for the authenticated user.
   * Catches 404 from experimental backend and returns a fallback envelope.
   *
   * @returns Promise resolving to `ApiResponse<MfaStatusData>`.
   */
  async getMfaStatus(): Promise<ApiResponse<MfaStatusData>> {
    try {
      const response = await this.api.get<ApiResponse<MfaStatusData>>('/auth/mfa/status');
      return response.data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        return {
          success: false,
          status: 404,
          message: 'MFA endpoints are not currently supported by the backend service',
        };
      }
      throw error;
    }
  }

  /**
   * Initiate MFA enrollment for the authenticated user.
   * Catches 404 from experimental backend and returns a fallback envelope.
   *
   * @returns Promise resolving to `ApiResponse<MfaEnrollmentData>`.
   */
  async initiateMfaEnrollment(): Promise<ApiResponse<MfaEnrollmentData>> {
    try {
      const response = await this.api.post<ApiResponse<MfaEnrollmentData>>('/auth/mfa/enroll');
      return response.data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        return {
          success: false,
          status: 404,
          message: 'MFA enrollment is not currently supported by the backend service',
        };
      }
      throw error;
    }
  }

  /**
   * Verify MFA enrollment code.
   * Requires authoritative confirmation from backend before MFA is enabled.
   *
   * @param data - Payload containing 6-digit TOTP code.
   * @returns Promise resolving to `ApiResponse<MfaVerifyData>`.
   */
  async verifyMfaEnrollment(data: MfaVerifyRequest): Promise<ApiResponse<MfaVerifyData>> {
    try {
      const response = await this.api.post<ApiResponse<MfaVerifyData>>('/auth/mfa/verify', data);
      return response.data;
    } catch (error: unknown) {
      if ((error as { response?: { status?: number } }).response?.status === 404) {
        return {
          success: false,
          status: 404,
          message: 'MFA verification is not currently supported by the backend service',
        };
      }
      throw error;
    }
  }

  /**
   * Request account deletion. Local token, conversations and drafts are cleared
   * even when the API call fails so the client does not keep private copies.
   * On-chain history cannot be deleted from this client.
   */
  async deleteAccount(): Promise<{
    api: boolean;
    token: boolean;
    conversations: boolean;
    drafts: boolean;
    removed: string[];
    remaining: string[];
    onChainHistoryDeleted: false;
  }> {
    const { clearAccountLocalStorage } = await import('@/lib/accountDeletion');
    let api = false;
    try {
      await this.api.delete('/account');
      api = true;
    } catch {
      api = false;
    }
    const local = clearAccountLocalStorage();
    this.token = null;
    return { api, ...local, onChainHistoryDeleted: false };
  }

  /**
   * Generic request method for custom endpoints.
   *
   * @template T - Expected response payload type.
   * @param config - Axios request configuration.
   * @returns Promise resolving to data payload of type T.
   * @throws {AxiosError} Throws if request fails.
   */
  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.api.request<T>(config);
    return response.data;
  }
}

// Create and export a singleton instance
export const apiService = new ApiService();
export default apiService;
