import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
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
} from "@/types";
import agentService from "./agentService";
import { tokenRefreshService } from "./tokenRefreshService";
import {
  isRetryableError,
  computeBackoffMs,
  sleep,
  incrementRetryCount,
  retryLabel,
} from "@/utils/retryUtils";
import { horizonFetch } from "@/utils/horizonFetch";
import { buildPaymentIdempotencyKey } from "@/utils/paymentIdempotency";
import {
  PaymentOutcomeUnknownError,
  isPaymentOutcomeUnknown,
} from "@/utils/paymentOutcome";

/**
 * Local trustline types keep this service independent of whether the
 * application-wide @/types barrel exports these types.
 */
export interface Trustline {
  assetCode: string;
  assetIssuer: string;
  balance: string;
  limit: string;
  assetType?: string;
  buyingLiabilities?: string;
  sellingLiabilities?: string;
}

export interface AddTrustlineRequest {
  assetCode: string;
  assetIssuer: string;
  limit?: string;
}

const FRIENDTEST_URL = "https://friendbot.stellar.org";

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
  isTestnet: boolean,
): Promise<FundingResult> => {
  if (currentBalance >= requiredAmount) {
    return {
      success: true,
      message: `Account is already sufficiently funded (${currentBalance} XLM >= required ${requiredAmount} XLM).`,
    };
  }

  try {
    const response = await axios.post("/api/fund", {
      publicKey,
      requiredAmount,
    });

    return {
      success: true,
      message: "Account funded successfully via backend service.",
      txHash: response.data.txHash,
    };
  } catch (backendError: unknown) {
    if (isTestnet) {
      try {
        const friendbotResponse = await axios.get(
          `${FRIENDTEST_URL}/?addr=${encodeURIComponent(publicKey)}`,
        );

        return {
          success: true,
          message:
            "Account funded successfully via Stellar Testnet Friendbot fallback.",
          txHash: friendbotResponse.data.hash,
        };
      } catch {
        throw new Error(
          `Funding failed: Backend service unavailable and Friendbot fallback failed. Required: ${requiredAmount} XLM, Current: ${currentBalance} XLM.`,
        );
      }
    }

    const statusCode = axios.isAxiosError(backendError)
      ? backendError.response?.status
      : undefined;

    if (statusCode === 429) {
      throw new Error(
        `Funding rate limit exceeded. Required: ${requiredAmount} XLM. Please try again later.`,
      );
    }

    if (statusCode === 400) {
      throw new Error(
        `Invalid funding request. Required balance: ${requiredAmount} XLM, Current: ${currentBalance} XLM.`,
      );
    }

    throw new Error(
      `Failed to fund account. Required: ${requiredAmount} XLM, Current: ${currentBalance} XLM. Please check your network connection.`,
    );
  }
};

// Lazy store reference prevents a circular dependency between the store,
// authentication slice, and API service.

type MinimalStore = {
  dispatch: (action: { type: string; payload?: unknown }) => void;
};

let _store: MinimalStore | null = null;

interface PaymentRequestConfig extends AxiosRequestConfig {
  paymentOperation?: boolean;
}

class ApiService {
  private api: AxiosInstance;
  private token: string | null = null;

  constructor() {
    this.loadTokenFromStorage();

    this.api = axios.create({
      baseURL:
        process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:2333",
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Attach the current token to outgoing requests.
    this.api.interceptors.request.use(
      (config) => {
        if (this.token) {
          config.headers.Authorization = `Bearer ${this.token}`;
        }

        return config;
      },
      (error) => Promise.reject(error),
    );

    // Retry eligible transient failures. Payment requests must carry an
    // idempotency key before being retried.
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config as
          | (AxiosRequestConfig & {
              _retryCount?: number;
              paymentOperation?: boolean;
            })
          | undefined;

        if (!originalRequest || !isRetryableError(error)) {
          return Promise.reject(error);
        }

        if (
          originalRequest.paymentOperation &&
          !originalRequest.headers
        ) {
          return Promise.reject(error);
        }

        const attempt = incrementRetryCount(originalRequest);
        const delayMs = computeBackoffMs(attempt - 1, error);
        const label = retryLabel(error);

        if (_store) {
          _store.dispatch({
            type: "ui/setRetryStatus",
            payload: {
              label,
              attempt,
              maxAttempts: 3,
              nextRetryAt: Date.now() + delayMs,
            },
          });
        }

        await sleep(delayMs);

        if (_store) {
          _store.dispatch({ type: "ui/clearRetryStatus" });
        }

        return this.api(originalRequest);
      },
    );

    // Refresh expired authentication tokens after a 401 response.
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config as
          | (AxiosRequestConfig & {
              _retry?: boolean;
              headers?: Record<string, unknown> & {
                Authorization?: string;
              };
            })
          | undefined;

        if (!originalRequest) {
          return Promise.reject(error);
        }

        if (
          error.response?.status !== 401 ||
          originalRequest._retry
        ) {
          if (error.response?.status === 401) {
            this.clearToken();

            if (typeof window !== "undefined") {
              window.location.href = "/auth/login";
            }
          }

          return Promise.reject(error);
        }

        originalRequest._retry = true;

        try {
          const { token: newToken } =
            await tokenRefreshService.refreshToken(
              this.api.defaults.baseURL as string,
            );

          this.setToken(newToken);

          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
          }

          if (_store) {
            _store.dispatch({
              type: "auth/setToken",
              payload: newToken,
            });
          }

          return this.api(originalRequest);
        } catch (refreshError) {
          this.clearToken();

          if (_store) {
            _store.dispatch({ type: "auth/clearAuth" });
          }

          if (typeof window !== "undefined") {
            window.location.href = "/auth/login";
          }

          return Promise.reject(refreshError);
        }
      },
    );
  }

  setStore(store: MinimalStore): void {
    _store = store;
  }

  getStore(): MinimalStore | null {
    return _store;
  }

  setToken(token: string): void {
    this.token = token;

    if (typeof window !== "undefined") {
      localStorage.setItem("auth_token", token);
    }
  }

  clearToken(): void {
    this.token = null;

    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
  }

  loadTokenFromStorage(): void {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("auth_token");

      if (token) {
        this.token = token;
      }
    }
  }

  // Authentication endpoints

  async register(data: RegisterRequest): Promise<RegisterResponse> {
    if (!data || typeof data !== "object") {
      throw new Error("Invalid registration data");
    }

    if (!data.email || typeof data.email !== "string") {
      throw new Error("Email is required and must be a string");
    }

    if (!data.password || typeof data.password !== "string") {
      throw new Error("Password is required and must be a string");
    }

    if (data.name && typeof data.name !== "string") {
      throw new Error("Name must be a string if provided");
    }

    const response = await this.api.post<RegisterResponse>(
      "/auth/register",
      data,
    );

    const registrationData = response.data as RegisterResponse & {
      data?: { token?: string };
    };

    if (
      registrationData.success &&
      registrationData.data?.token
    ) {
      this.setToken(registrationData.data.token);
    }

    return response.data;
  }

  /**
   * Verify current credentials without changing the active session token.
   */
  async reauthenticate(email: string, password: string): Promise<void> {
    const response = await axios.post<LoginResponse>(
      this.api.getUri({ url: "/auth/login" }),
      { email, password },
      { headers: { "Content-Type": "application/json" } },
    );

    if (!response.data?.success) {
      throw new Error(response.data?.message || "Re-authentication failed");
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
    if (!data || typeof data !== "object") {
      throw new Error("Invalid login data");
    }

    if (!data.email || typeof data.email !== "string") {
      throw new Error("Email is required and must be a string");
    }

    if (!data.password || typeof data.password !== "string") {
      throw new Error("Password is required and must be a string");
    }

    const response = await this.api.post<LoginResponse>(
      "/auth/login",
      data,
    );

    if (response.data.success && response.data.data.token) {
      this.setToken(response.data.data.token);
    }

    return response.data;
  }

  async googleAuth(token: string): Promise<LoginResponse> {
    const response = await this.api.post<LoginResponse>(
      "/auth/google-auth",
      { token },
    );

    if (response.data.success && response.data.data.token) {
      this.setToken(response.data.data.token);
    }

    return response.data;
  }

  async verifyEmail(
    token: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.get<
      ApiResponse<{ message: string }>
    >(`/auth/verify-email/${encodeURIComponent(token)}`);

    return response.data;
  }

  async resendVerification(
    email: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<
      ApiResponse<{ message: string }>
    >("/auth/resend-verification", { email });

    return response.data;
  }

  async forgotPassword(
    email: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<
      ApiResponse<{ message: string }>
    >("/auth/forgot-password", { email });

    return response.data;
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<
      ApiResponse<{ message: string }>
    >(`/auth/reset-password/${encodeURIComponent(token)}`, {
      password,
    });

    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.api.post(
        "/auth/logout",
        {},
        { withCredentials: true },
      );
    } catch (error) {
      console.warn(
        "Logout request failed; clearing local state anyway.",
        error,
      );
    } finally {
      this.clearToken();

      if (typeof window !== "undefined") {
        localStorage.removeItem("user_data");
        localStorage.removeItem("refresh_token");
        sessionStorage.clear();
      }
    }
  }

  async refreshToken(): Promise<{ token: string }> {
    const response = await axios.post<{ token: string }>(
      `${this.api.defaults.baseURL}/auth/refresh`,
      {},
      {
        headers: { "Content-Type": "application/json" },
        withCredentials: true,
      },
    );

    if (response.data?.token) {
      this.setToken(response.data.token);
    }

    return response.data;
  }

  // Protected profile endpoints

  async getMe(): Promise<ApiResponse<User>> {
    const response = await this.api.get<ApiResponse<User>>(
      "/auth/me",
    );

    return response.data;
  }

  async getProfile(): Promise<ApiResponse<User>> {
    const response = await this.api.get<ApiResponse<User>>(
      "/auth/profile",
    );

    return response.data;
  }

  async updateProfile(
    data: Partial<User>,
  ): Promise<ApiResponse<User>> {
    const response = await this.api.put<ApiResponse<User>>(
      "/auth/profile",
      data,
    );

    return response.data;
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<ApiResponse<{ message: string }>> {
    const response = await this.api.post<
      ApiResponse<{ message: string }>
    >("/auth/change-password", {
      currentPassword,
      newPassword,
    });

    return response.data;
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
    const { clearAccountLocalStorage } = await import(
      "@/lib/accountDeletion"
    );

    let api = false;

    try {
      await this.api.delete("/account");
      api = true;
    } catch {
      api = false;
    }

    const local = clearAccountLocalStorage();
    this.clearToken();

    return {
      api,
      ...local,
      onChainHistoryDeleted: false,
    };
  }

  async exportUserData(): Promise<Blob> {
    const endpoints = [
      "/data-export",
      "/data/export",
      "/api/data-export",
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await this.api.get<Blob>(endpoint, {
          responseType: "blob",
        });

        if (response.status === 200 && response.data) {
          return response.data;
        }
      } catch (error: unknown) {
        if (
          axios.isAxiosError(error) &&
          error.response?.status === 404
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new Error("User data export endpoint not found.");
  }

  // Starknet account management

  async deployAccount(): Promise<
    ApiResponse<{
      transactionHash: string;
      contractAddress: string;
    }>
  > {
    const response = await this.api.post<
      ApiResponse<{
        transactionHash: string;
        contractAddress: string;
      }>
    >("/auth/starknet/deploy");

    return response.data;
  }

  async getBalance(): Promise<BalanceResponse> {
    const response = await this.api.get<BalanceResponse>(
      "/auth/starknet/balance",
    );

    return response.data;
  }

  async getAccountStatus(): Promise<
    ApiResponse<{
      isDeployed: boolean;
      isFunded: boolean;
      address: string;
      publicKey: string;
    }>
  > {
    const response = await this.api.get<
      ApiResponse<{
        isDeployed: boolean;
        isFunded: boolean;
        address: string;
        publicKey: string;
      }>
    >("/auth/starknet/status");

    return response.data;
  }

  // Automatic funding

  async fundAccount(): Promise<
    ApiResponse<{ transactionHash: string; amount: string }>
  > {
    const response = await this.api.post<
      ApiResponse<{ transactionHash: string; amount: string }>
    >("/auth/funding/fund-account");

    return response.data;
  }

  async getAutoFundingStats(): Promise<
    ApiResponse<{
      totalFunded: number;
      totalAccounts: number;
      averageAmount: string;
    }>
  > {
    const response = await this.api.get<
      ApiResponse<{
        totalFunded: number;
        totalAccounts: number;
        averageAmount: string;
      }>
    >("/auth/funding/auto-funding-stats");

    return response.data;
  }

  async getFundedAccountBalance(): Promise<
    ApiResponse<{ balance: string; hasBalance: boolean }>
  > {
    const response = await this.api.get<
      ApiResponse<{ balance: string; hasBalance: boolean }>
    >("/auth/funding/funded-account-balance");

    return response.data;
  }

  async batchFund(
    amounts: string[],
  ): Promise<
    ApiResponse<{
      transactionHashes: string[];
      totalAmount: string;
    }>
  > {
    const response = await this.api.post<
      ApiResponse<{
        transactionHashes: string[];
        totalAmount: string;
      }>
    >("/auth/funding/batch-fund", { amounts });

    return response.data;
  }

  // Account transaction endpoints

  async getAccountTransactions(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<
    ApiResponse<{
      transactions: StellarTransaction[];
      total: number;
      page: number;
      limit: number;
    }>
  > {
    try {
      const response = await this.api.get<
        ApiResponse<{
          transactions: StellarTransaction[];
          total: number;
          page: number;
          limit: number;
        }>
      >("/account/transactions", {
        params: { userId, page, limit },
      });

      return response.data;
    } catch (error: unknown) {
      // Try the alternative route used by older backend implementations
      // only when the primary route is not found.
      if (
        !axios.isAxiosError(error) ||
        error.response?.status !== 404
      ) {
        throw error;
      }

      const response = await this.api.get<
        ApiResponse<{
          transactions: StellarTransaction[];
          total: number;
          page: number;
          limit: number;
        }>
      >(
        `/account/${encodeURIComponent(userId)}/transactions`,
        { params: { page, limit } },
      );

      return response.data;
    }
  }

  // Payment endpoints
  //
  // Both call signatures are supported to avoid breaking existing callers:
  //   sendPayment(payment, idempotencyKey) -> PaymentSubmissionResult
  //   sendPayment(payment) -> API response envelope

  async sendPayment(
    payment: SendPaymentRequest,
    idempotencyKey: string,
  ): Promise<PaymentSubmissionResult>;

  async sendPayment(
    payment: SendPaymentRequest,
  ): Promise<ApiResponse<{ paymentId: string; status: string }>>;

  async sendPayment(
    payment: SendPaymentRequest,
    suppliedIdempotencyKey?: string,
  ): Promise<
    | PaymentSubmissionResult
    | ApiResponse<{ paymentId: string; status: string }>
  > {
    const paymentWithKey = payment as SendPaymentRequest & {
      idempotencyKey?: string;
    };

    const idempotencyKey =
      suppliedIdempotencyKey ||
      paymentWithKey.idempotencyKey ||
      buildPaymentIdempotencyKey(payment);

    try {
      const response = await this.api.post<
        | PaymentSubmissionResult
        | ApiResponse<{ paymentId: string; status: string }>
        | ApiResponse<PaymentSubmissionResult>
      >(
        "/payments",
        {
          ...payment,
          idempotencyKey,
        },
        {
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
          paymentOperation: true,
        } as PaymentRequestConfig,
      );

      const payload = response.data;

      // Preserve the API envelope for the one-argument overload.
      if (!suppliedIdempotencyKey) {
        return payload as ApiResponse<{
          paymentId: string;
          status: string;
        }>;
      }

      // The two-argument overload returns the unwrapped payment result.
      if ("success" in payload) {
        if (!payload.success) {
          throw new Error(
            payload.message || "Payment submission failed.",
          );
        }

        return payload.data as PaymentSubmissionResult;
      }

      return payload as PaymentSubmissionResult;
    } catch (error: unknown) {
      if (isPaymentOutcomeUnknown(error)) {
        throw new PaymentOutcomeUnknownError(
          "We could not confirm whether the payment was submitted. Check its status before taking any further action.",
        );
      }

      throw error;
    }
  }

  async getPaymentStatus(
    idempotencyKey: string,
  ): Promise<PaymentStatusResult> {
    const response = await this.api.get<
      PaymentStatusResult | ApiResponse<PaymentStatusResult>
    >("/payments/status", {
      params: { idempotencyKey },
    });

    const payload = response.data;

    if ("success" in payload) {
      if (!payload.success) {
        throw new Error(
          payload.message || "Payment status is unavailable.",
        );
      }

      return payload.data;
    }

    return payload;
  }

  // Contact management

  async getContacts(): Promise<ApiResponse<Contact[]>> {
    try {
      const response = await this.api.get<ApiResponse<Contact[]>>(
        "/contacts",
      );

      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404
      ) {
        return {
          success: true,
          data: [],
          message:
            "Contact management is available through the chat interface",
        };
      }

      throw error;
    }
  }

  async createContact(
    data: CreateContactRequest,
  ): Promise<ApiResponse<Contact>> {
    try {
      const response = await this.api.post<ApiResponse<Contact>>(
        "/contacts",
        data,
      );

      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404
      ) {
        return {
          success: false,
          status: 404,
          message:
            'Contact creation is available through the chat interface. Try: "Add John as a contact with address 0x123..."',
        };
      }

      throw error;
    }
  }

  async updateContact(
    id: string,
    data: UpdateContactRequest,
  ): Promise<ApiResponse<Contact>> {
    try {
      const response = await this.api.put<ApiResponse<Contact>>(
        `/contacts/${encodeURIComponent(id)}`,
        data,
      );

      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404
      ) {
        return {
          success: false,
          status: 404,
          message:
            "Contact updates are available through the chat interface",
        };
      }

      throw error;
    }
  }

  async deleteContact(
    id: string,
  ): Promise<ApiResponse<{ message: string }>> {
    try {
      const response = await this.api.delete<
        ApiResponse<{ message: string }>
      >(`/contacts/${encodeURIComponent(id)}`);

      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404
      ) {
        return {
          success: false,
          status: 404,
          message:
            'Contact deletion is available through the chat interface. Try: "Remove John from my contacts"',
        };
      }

      throw error;
    }
  }

  // Agent query

  async queryAgent(
    data: AgentQueryRequest,
    options?: { signal?: AbortSignal },
  ): Promise<AgentQueryResponse> {
    const isAbort = (error: unknown): boolean => {
      const value = error as { code?: string; name?: string };

      return (
        value.code === "ERR_CANCELED" ||
        value.name === "CanceledError" ||
        value.name === "AbortError"
      );
    };

    try {
      if (agentService.isAgentConnected()) {
        logger.debug(
          "[ApiService] Using experimental agent service",
        );

        return await agentService.queryAgent(data, options);
      }
    } catch (error: unknown) {
      if (isAbort(error)) {
        throw error;
      }

      console.warn(
        "[ApiService] Experimental agent service failed; falling back to backend:",
        error,
      );
    }

    try {
      if (!data.query || data.query.trim().length === 0) {
        throw new Error("Query cannot be empty");
      }

      logger.debug("[ApiService] Querying backend /query endpoint");

      const response = await this.api.post(
        "/query",
        data,
        { signal: options?.signal },
      );

      if (response.data?.result) {
        return {
          result: {
            success: response.data.result.success ?? true,
            data: response.data.result.data || "Success",
            error: response.data.result.error,
            executionTrace:
              response.data.result.executionTrace,
          },
        };
      }

      return {
        result: {
          success: true,
          data:
            typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data),
          error: undefined,
        },
      };
    } catch (error: unknown) {
      if (isAbort(error)) {
        throw error;
      }

      console.error("[ApiService] Backend query failed:", error);

      const errorValue = error as {
        response?: { data?: { message?: string } };
        message?: string;
      };

      const errorMsg =
        errorValue.response?.data?.message ||
        errorValue.message ||
        "Unknown error";

      let friendlyMessage = "Query failed. Please try again.";

      if (errorMsg.toLowerCase().includes("invalid query")) {
        friendlyMessage =
          "I didn't understand that. Could you please rephrase your question?";
      } else if (errorMsg.toLowerCase().includes("timeout")) {
        friendlyMessage =
          "The request is taking longer than expected. Please try again.";
      } else if (errorMsg.toLowerCase().includes("network")) {
        friendlyMessage =
          "I'm having trouble connecting. Please check your internet connection and try again.";
      }

      return {
        result: {
          success: false,
          data: friendlyMessage,
          error: errorMsg,
        },
      };
    }
  }

  // Agent-specific methods

  async getAgentStatus() {
    try {
      return await agentService.getStatus();
    } catch (error) {
      console.error("Failed to get agent status:", error);

      const now = new Date().toISOString();

      return {
        isOnline: false,
        version: "1.0.0",
        uptime: 0,
        lastActivity: now,
        activeConnections: 0,
        services: {
          vesu: {
            isActive: false,
            isHealthy: false,
            lastCheck: now,
          },
          atomiq: {
            isActive: false,
            isHealthy: false,
            lastCheck: now,
          },
          xverse: {
            isActive: false,
            isHealthy: false,
            lastCheck: now,
          },
          troves: {
            isActive: false,
            isHealthy: false,
            lastCheck: now,
          },
          database: {
            isActive: false,
            isHealthy: false,
            lastCheck: now,
          },
        },
      };
    }
  }

  async getAgentCapabilities() {
    try {
      return await agentService.getCapabilities();
    } catch (error) {
      console.error("Failed to get agent capabilities:", error);

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
          swapping: false,
        },
        limits: {
          maxQueryLength: 0,
          maxConcurrentQueries: 0,
          rateLimitPerMinute: 0,
        },
      };
    }
  }

  async checkAgentHealth() {
    try {
      return await agentService.healthCheck();
    } catch (error) {
      console.error("Failed to check agent health:", error);
      throw error;
    }
  }

  async getAgentTools() {
    try {
      return await agentService.getTools();
    } catch (error) {
      console.error("Failed to get agent tools:", error);
      return [];
    }
  }

  async executeAgentTool(
    toolName: string,
    params: Record<string, unknown>,
  ) {
    try {
      return await agentService.executeTool(toolName, params);
    } catch (error) {
      console.error(
        `Failed to execute agent tool ${toolName}:`,
        error,
      );

      throw error;
    }
  }

  async getAgentMemory(userId: string) {
    try {
      return await agentService.getMemory(userId);
    } catch (error) {
      console.error("Failed to get agent memory:", error);
      return [];
    }
  }

  async clearAgentMemory(userId: string): Promise<void> {
    try {
      await agentService.clearMemory(userId);
    } catch (error) {
      console.error("Failed to clear agent memory:", error);
      throw error;
    }
  }

  // Conversation endpoints

  async getConversationStats(): Promise<
    ApiResponse<{
      totalConversations: number;
      totalMessages: number;
      activeConversations: number;
    }>
  > {
    const response = await this.api.get<
      ApiResponse<{
        totalConversations: number;
        totalMessages: number;
        activeConversations: number;
      }>
    >("/chat/stats");

    return response.data;
  }

  // Prompt versions

  async getPromptVersions(): Promise<
    | PromptVersionRecord[]
    | ApiResponse<PromptVersionRecord[]>
    | PromptVersionRecord
  > {
    const response = await this.api.get<
      | PromptVersionRecord[]
      | ApiResponse<PromptVersionRecord[]>
      | PromptVersionRecord
    >("/versions");

    return response.data;
  }

  async activatePromptVersion(
    id: string,
  ): Promise<
    ApiResponse<PromptVersionRecord> | PromptVersionRecord
  > {
    const response = await this.api.patch<
      ApiResponse<PromptVersionRecord> | PromptVersionRecord
    >(`/versions/${encodeURIComponent(id)}/activate`);

    return response.data;
  }

  // Liquidity endpoints

  async getLiquidityStats(
    request?: LiquidityRequest,
  ): Promise<ApiResponse<LiquidityStats>> {
    const response = await this.api.post<
      ApiResponse<LiquidityStats>
    >("/liquidity", request || {});

    return response.data;
  }

  // Audit log endpoints

  async getAuditLogs(
    params: AuditLogsQueryParams = {},
  ): Promise<AuditLogsResponse> {
    const response = await this.api.get<AuditLogsResponse>(
      "/audit",
      { params },
    );

    return response.data;
  }

  async getAuditLogById(
    id: string,
  ): Promise<ApiResponse<AuditLogEntry>> {
    const response = await this.api.get<
      ApiResponse<AuditLogEntry>
    >(`/audit/${encodeURIComponent(id)}`);

    return response.data;
  }

  async getAuditLogStats(): Promise<
    ApiResponse<AuditLogStats>
  > {
    const response = await this.api.get<
      ApiResponse<AuditLogStats>
    >("/audit/stats");

    return response.data;
  }

  async exportAuditLogs(
    params: AuditLogsQueryParams = {},
  ): Promise<Blob> {
    const response = await this.api.get<Blob>("/audit/export", {
      params,
      responseType: "blob",
    });

    return response.data;
  }


  // Generic request helper

  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const response = await this.api.request<T>(config);
    return response.data;
  }

  // Stellar trustline endpoints

  async fetchAccountTrustlines(
    publicKey: string,
  ): Promise<Trustline[]> {
    try {
      const response = await this.api.get<
        ApiResponse<Trustline[]> | Trustline[]
      >(`/account/${encodeURIComponent(publicKey)}/trustlines`);

      if (Array.isArray(response.data)) {
        return response.data;
      }

      if (
        response.data &&
        "data" in response.data &&
        Array.isArray(response.data.data)
      ) {
        return response.data.data;
      }
    } catch {
      // Fall back to the secure Horizon proxy if the backend fails.
      try {
        const response = await horizonFetch(
          `/accounts/${encodeURIComponent(publicKey)}`,
        );

        if (response.ok) {
          const accountData = await response.json();
          const balances = Array.isArray(accountData.balances)
            ? accountData.balances
            : [];

          return balances
            .filter(
              (balance: { asset_type?: string }) =>
                balance.asset_type !== "native",
            )
            .map(
              (balance: {
                asset_code?: string;
                asset_issuer?: string;
                balance?: string;
                limit?: string;
                asset_type?: string;
                buying_liabilities?: string;
                selling_liabilities?: string;
              }) => ({
                assetCode: balance.asset_code || "",
                assetIssuer: balance.asset_issuer || "",
                balance: balance.balance || "0",
                limit: balance.limit || "0",
                assetType: balance.asset_type,
                buyingLiabilities: balance.buying_liabilities,
                sellingLiabilities: balance.selling_liabilities,
              }),
            );
        }
      } catch (fallbackError) {
        logger.warn(
          "Horizon fallback for trustlines failed",
          fallbackError,
        );
      }
    }

    return [];
  }

  async addTrustline(
    publicKey: string,
    data: AddTrustlineRequest,
  ): Promise<ApiResponse<Trustline> | unknown> {
    const response = await this.api.post<
      ApiResponse<Trustline> | Trustline
    >(
      `/account/${encodeURIComponent(publicKey)}/trustlines`,
      data,
    );

    return response.data;
  }

  async removeTrustline(
    publicKey: string,
    assetCode: string,
    assetIssuer: string,
  ): Promise<ApiResponse<void> | unknown> {
    const response = await this.api.delete<ApiResponse<void>>(
      `/account/${encodeURIComponent(publicKey)}/trustlines`,
      {
        data: { assetCode, assetIssuer },
      },
    );

    return response.data;
  }

  // Multi-factor authentication endpoints

  async getMfaStatus(): Promise<ApiResponse<MfaStatusData>> {
    try {
      const response = await this.api.get<ApiResponse<MfaStatusData>>(
        "/auth/mfa/status",
      );

      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404
      ) {
        return {
          success: false,
          status: 404,
          message:
            "MFA endpoints are not currently supported by the backend service",
        };
      }

      throw error;
    }
  }

  async initiateMfaEnrollment(): Promise<
    ApiResponse<MfaEnrollmentData>
  > {
    try {
      const response = await this.api.post<
        ApiResponse<MfaEnrollmentData>
      >("/auth/mfa/enroll");

      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404
      ) {
        return {
          success: false,
          status: 404,
          message:
            "MFA enrollment is not currently supported by the backend service",
        };
      }

      throw error;
    }
  }

  async verifyMfaEnrollment(
    data: MfaVerifyRequest,
  ): Promise<ApiResponse<MfaVerifyData>> {
    try {
      const response = await this.api.post<
        ApiResponse<MfaVerifyData>
      >("/auth/mfa/verify", data);

      return response.data;
    } catch (error: unknown) {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 404
      ) {
        return {
          success: false,
          status: 404,
          message:
            "MFA verification is not currently supported by the backend service",
        };
      }

      throw error;
    }
  }
}

// Singleton instance

export const apiService = new ApiService();
export default apiService;

// Standalone trustline helpers

export const fetchAccountTrustlines = (
  publicKey: string,
): Promise<Trustline[]> =>
  apiService.fetchAccountTrustlines(publicKey);

export const addTrustline = (
  publicKey: string,
  data: AddTrustlineRequest,
): Promise<ApiResponse<Trustline> | unknown> =>
  apiService.addTrustline(publicKey, data);

export const removeTrustline = (
  publicKey: string,
  assetCode: string,
  assetIssuer: string,
): Promise<ApiResponse<void> | unknown> =>
  apiService.removeTrustline(publicKey, assetCode, assetIssuer);

export const getAccountTransactions = (
  userId: string,
  page = 1,
  limit = 10,
) => apiService.getAccountTransactions(userId, page, limit);