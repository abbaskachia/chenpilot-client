// User and Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  address: string;
  publicKey: string;
  isDeployed: boolean;
  isFunded: boolean;
  tokenType: "XLM";
  authProvider: "email" | "google";
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StellarAccountInfo {
  address: string;
  publicKey: string;
  isDeployed: boolean;
  deploymentTransactionHash?: string;
}

// Keep for backward compatibility
export type StarknetAccountInfo = StellarAccountInfo;

export interface AccountStatus {
  isDeployed: boolean;
  isFunded: boolean;
  deploymentTransactionHash?: string;
  fundingTransactionHash?: string;
  balance: string;
  address: string;
  publicKey: string;
}

// Authentication Request/Response Types
export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
    stellarAccount: StellarAccountInfo;
    starknetAccount: StellarAccountInfo; // Alias for backward compatibility
    setupStatus: {
      funding: {
        success: boolean;
        error?: string;
        amount: string;
        transactionHash?: string;
      };
      deployment: {
        success: boolean;
        transactionHash?: string;
        contractAddress?: string;
      };
      fullyReady: boolean;
    };
  };
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token: string;
    stellarAccount: StellarAccountInfo;
    starknetAccount: StellarAccountInfo; // Alias for backward compatibility
  };
}

// Multi-Factor Authentication (MFA) Types
export interface MfaStatusData {
  enabled: boolean;
  enrolledAt?: string;
  method?: "totp" | null;
}

export interface MfaEnrollmentData {
  secret: string;
  qrCodeUrl?: string;
  otpAuthUri?: string;
  recoveryCodes?: string[];
}

export interface MfaVerifyRequest {
  code: string;
}

export interface MfaVerifyData {
  enabled: boolean;
  message?: string;
  recoveryCodes?: string[];
}

// Contact Management Types
export interface Contact {
  id: string;
  name: string;
  address: string;
  tokenType: "XLM" | "STRK" | "USDC" | "USDT" | "BTC" | "ETH" | "AQUA";
  note?: string;
  createdAt: string;
  updatedAt: string;
  avatar?: string;
  isFavorite?: boolean;
  lastUsed?: string;
}

export interface CreateContactRequest {
  name: string;
  address: string;
  tokenType: "XLM" | "STRK" | "USDC" | "USDT" | "BTC" | "ETH" | "AQUA";
  note?: string;
}

export interface UpdateContactRequest {
  name?: string;
  address?: string;
  tokenType?: "XLM" | "STRK" | "USDC" | "USDT" | "BTC" | "ETH" | "AQUA";
  note?: string;
}

// Balance and Wallet Types
export interface BalanceResponse {
  success: boolean;
  data: {
    hasBalance: boolean;
    balance: string;
    required: string;
    nativeBalance: string;
  };
}

export interface WalletBalance {
  hasBalance: boolean;
  balance: string;
  required: string;
  nativeBalance: string;
}

// Stellar Transaction Types
export type TransactionDirection = 'incoming' | 'outgoing' | 'self' | 'unknown';

export interface StellarOperation {
  id: string;
  type: string; // e.g., 'payment', 'create_account', 'trust', etc.
  amount?: string;
  asset?: string;
  from?: string;
  to?: string;
  source_account: string;
  direction?: TransactionDirection;
}

export interface StellarTransaction {
  id: string;
  hash: string;
  ledger: number;
  created_at: string;
  source_account: string;
  fee_charged: string;
  operation_count: number;
  successful: boolean;
  operations: StellarOperation[];
  direction?: TransactionDirection;
}

/**
 * Lifecycle of a wallet action.
 *
 * `pending` means the action was submitted but no authoritative data has
 * confirmed its outcome yet. Only authoritative ledger data may move an entry
 * to `confirmed`, and only an authoritative failure (or a definitive submission
 * rejection) may move it to `failed`.
 */
export type TransactionLifecycleStatus = "pending" | "confirmed" | "failed";

export interface PendingTransactionConfirmation {
  /** Normalized transaction hash — the stable reconciliation key. */
  hash: string;
  /** Human-readable description of the wallet action. */
  label: string;
  status: TransactionLifecycleStatus;
  /** ISO timestamp of the last status change for this entry. */
  updatedAt: string;
}

export interface TransactionHistory {
  transactions: StellarTransaction[];
  isLoading: boolean;
  error: string | null;
  /** True while a newest-page refresh is in flight (background refresh). */
  isRefreshing: boolean;
  /** Error from the most recent refresh attempt; existing history is preserved. */
  refreshError: string | null;
  /** ISO timestamp of the last successful authoritative sync of the newest page. */
  lastUpdatedAt: string | null;
  /** Cursor for the next (older) page, or null when there is no next page. */
  nextCursor: string | null;
  /** True while an older page is being loaded. */
  isLoadingMore: boolean;
  /** Error from the most recent older-page load; existing history is preserved. */
  loadMoreError: string | null;
  /** Submitted transactions awaiting authoritative confirmation, keyed by hash. */
  pending: PendingTransactionConfirmation[];
}

// Agent Query Types
export interface AgentQueryRequest {
  userId: string;
  query: string;
}

export interface AgentQueryResponse {
  result: {
    success: boolean;
    data: string;
    error?: string;
    executionTrace?: ExecutionTrace;
  };
}

// Execution Trace Types
export interface ExecutionTrace {
  steps: ExecutionStep[];
  totalTime: number;
  startTime: string;
  endTime: string;
}

export interface ExecutionStep {
  id: string;
  name: string;
  type: "thought" | "action" | "tool_call" | "result" | "error";
  timestamp: string;
  duration: number;
  description: string;
  details?: Record<string, unknown>;
  substeps?: ExecutionStep[];
}

// Chat and Message Types

/** Discriminates between plain text and voice messages */
export type MessageType = "text" | "voice";

export interface ChatMessage {
  id: string;
  type: "user" | "agent" | "system";
  /** 'text' (default) or 'voice' */
  messageType?: MessageType;
  content: string;
  timestamp: string;
  serverTimestamp?: number | string;
  /** ID of the message this is a reply to (undefined for root messages) */
  parentId?: string;
  /** Root message ID of the thread this message belongs to */
  threadId?: string;
  /** Number of direct replies to this message (only tracked on root messages) */
  replyCount?: number;
  /** Voice message fields — only present when messageType === 'voice' */
  voice?: {
    /** Base64 data URL (e.g. "data:audio/webm;base64,...") stored for offline playback */
    audioUrl: string;
    /** Recording duration in seconds */
    duration: number;
    /** MIME type of the recorded audio (e.g. "audio/webm;codecs=opus") */
    mimeType: string;
    /** Auto-generated transcript via Web Speech API (may be empty string) */
    transcript: string;
    /** Approximate size of the audio data in bytes (before base64 encoding) */
    sizeBytes: number;
  };
  metadata?: {
    transactionHash?: string;
    amount?: string;
    tokenType?: string;
    status?: "pending" | "success" | "failed" | "cancelled";
    success?: boolean;
    error?: string;
    type?: string;
    action?: string;
    asset?: string;
    requiresConfirmation?: boolean;
    executionTrace?: ExecutionTrace;
    rawData?: Record<string, unknown>;
    serverTimestamp?: number | string;
    clientTimestamp?: number | string;
    optimisticId?: string;
    tempId?: string;
  };
}

/** Represents an open thread panel for a given root message */
export interface ThreadState {
  /** ID of the root message whose thread is open */
  rootMessageId: string;
  /** Flat list of reply messages in the thread */
  replies: ChatMessage[];
  /** Whether the thread panel is typing an agent response */
  isTyping: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  userId: string;
  messageCount: number;
  messages?: ChatMessage[];
  tags?: string[];
}

export interface ConversationTag {
  id: string;
  name: string;
  color?: string;
  userId: string;
}

export interface PromptVersionRecord {
  [key: string]: unknown;
}

export interface PromptVersion {
  id: string;
  label: string;
  description: string;
  template: string;
  version: string;
  isActive: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  raw: PromptVersionRecord;
}

// API Response Types
export interface ApiError {
  success: false;
  status: number;
  message: string;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// UI State Types
export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  title: string;
  message: string;
  duration?: number;
  timestamp: string;
}

export interface Theme {
  mode: "light" | "dark";
}

// Form Types
export interface FormField {
  name: string;
  label: string;
  type: "text" | "email" | "password" | "number" | "select";
  placeholder?: string;
  required?: boolean;
  validation?: { required?: boolean; min?: number; max?: number; pattern?: string; message?: string };
  options?: { value: string; label: string }[];
}

// Navigation Types
export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: string;
  badge?: string | number;
  children?: NavItem[];
}

// Environment Configuration
export interface Environment {
  API_BASE_URL: string;
  GOOGLE_CLIENT_ID: string;
  APP_NAME: string;
  APP_VERSION: string;
  NODE_ENV: "development" | "production" | "test";
}

// Redux State Types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AccountState {
  status: AccountStatus | null;
  balance: WalletBalance | null;
  transactions: TransactionHistory;
  isLoading: boolean;
  error: string | null;
  network: {
    status: "healthy" | "degraded" | "down" | "unknown";
    latestLedger: number | null;
    ledgerCloseTimeMs: number | null;
    ledgerAgeSeconds: number | null;
    congestion: boolean;
    accountSyncState: "synced" | "syncing" | "desynced";
    lastUpdated: string | null;
    isLoading: boolean;
    error: string | null;
  };
}

export interface ContactsState {
  list: Contact[];
  isLoading: boolean;
  error: string | null;
  selectedContact: Contact | null;
}

export interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  isTyping: boolean;
}

export interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  notifications: Notification[];
  modals: {
    [key: string]: boolean;
  };
}

export interface RootState {
  auth: AuthState;
  account: AccountState;
  contacts: ContactsState;
  chat: ChatState;
  ui: UIState;
}

// Component Props Types
export interface ButtonProps {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export interface CardProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

// Utility Types
export type TokenType = "XLM" | "USDC" | "USDT" | "BTC" | "ETH" | "AQUA";
export type AuthProvider = "email" | "google";
export type MessageType = "user" | "agent" | "system";
export type NotificationType = "success" | "error" | "warning" | "info";
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ModalSize = "sm" | "md" | "lg" | "xl";

// Liquidity Pool Types
export interface LiquidityPool {
  id: string;
  name: string;
  token1: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
  };
  token2: {
    symbol: string;
    name: string;
    address: string;
    decimals: number;
  };
  reserve1: string;
  reserve2: string;
  totalLiquidity: string;
  apr: number;
  volume24h: string;
  fee: number;
  isActive: boolean;
  created_at: string;
}

export interface LiquidityStats {
  totalPools: number;
  totalLiquidity: string;
  totalVolume24h: string;
  averageAPR: number;
  activePools: number;
  topPools: LiquidityPool[];
  networkMetrics: {
    gasPrice: string;
    blockNumber: number;
    timestamp: string;
  };
}

export interface LiquidityRequest {
  includeInactive?: boolean;
  limit?: number;
  sortBy?: "liquidity" | "volume" | "apr";
  sortOrder?: "asc" | "desc";
}

// === Audit Log Types ===
export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.register"
  | "user.update_profile"
  | "user.delete_account"
  | "user.password_change"
  | "user.email_verify"
  | "user.token_refresh"
  | "transaction.create"
  | "transaction.send"
  | "transaction.receive"
  | "transaction.swap"
  | "contact.create"
  | "contact.update"
  | "contact.delete"
  | "agent.query"
  | "agent.tool_execute"
  | "auth.google_auth"
  | "admin.access"
  | "admin.audit_view"
  | "settings.update"
  | "account.deploy"
  | "account.fund"
  | "liquidity.query";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  description: string;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  severity: AuditSeverity;
  status: "success" | "failure" | "pending";
  duration?: number;
  timestamp: string;
  createdAt: string;
}

export interface AuditLogsQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  userId?: string;
  action?: AuditAction;
  severity?: AuditSeverity;
  status?: "success" | "failure" | "pending";
  startDate?: string;
  endDate?: string;
  sortBy?: "timestamp" | "action" | "userEmail" | "severity";
  sortOrder?: "asc" | "desc";
}

export interface AuditLogsResponse {
  success: boolean;
  data: {
    logs: AuditLogEntry[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  message?: string;
}

export interface AuditLogStats {
  totalLogs: number;
  uniqueUsers: number;
  actionsByType: Record<string, number>;
  errorsToday: number;
  warningsToday: number;
  recentActivity: AuditLogEntry[];
}

// Send Payment Types
export interface SendPaymentRequest {
  recipientAddress: string;
  amount: string;
  tokenType: 'XLM' | 'STRK' | 'USDC' | 'USDT' | 'BTC' | 'ETH' | 'AQUA';
  memo?: string;
  memoType?: 'none' | 'text' | 'id' | 'hash';
  recipientContactId?: string; // Optional reference to selected contact
  idempotencyKey?: string;
}

export interface PaymentSubmissionResult {
  status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  transactionHash?: string;
  transactionId?: string;
  message?: string;
}

export interface PaymentStatusResult extends Omit<PaymentSubmissionResult, 'status'> {
  status: PaymentSubmissionResult['status'] | 'not_found';
}

export interface SendPaymentValidationResult {
  isValid: boolean;
  errors: string[];
  data?: SendPaymentRequest;
}

// Contact Selection Types
export interface ContactSelection {
  id: string;
  name: string;
  address: string;
  tokenType: 'XLM' | 'STRK' | 'USDC' | 'USDT' | 'BTC' | 'ETH' | 'AQUA';
  note?: string;
  avatar?: string;
  isFavorite?: boolean;
  lastUsed?: string;
}

export interface ContactPickerState {
  isOpen: boolean;
  selectedContact: ContactSelection | null;
  searchTerm: string;
  filteredContacts: ContactSelection[];
}

export interface ContactPickerProps {
  contacts: Contact[];
  onSelect: (contact: ContactSelection) => void;
  onClose: () => void;
  isOpen: boolean;
  isLoading?: boolean;
  tokenType?: 'XLM' | 'USDC' | 'USDT' | 'BTC' | 'ETH' | 'AQUA';
}

export interface PaymentLimits {
  minAmount: number;
  maxAmount: number;
  maxMemoLength: number;
  supportedTokens: TokenType[];
}

export interface PaymentFeeEstimate {
  baseFee: string;
  estimatedTotal: string;
  tokenType: string;
}

// Account Deployment Types
export type DeploymentStep = 'auth' | 'funding' | 'deployment' | 'verification' | 'complete';

export type DeploymentStepStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface DeploymentStepInfo {
  id: DeploymentStep;
  title: string;
  description: string;
  status: DeploymentStepStatus;
  timestamp?: string;
  transactionHash?: string;
  error?: string;
}

export interface DeploymentProgress {
  currentStep: DeploymentStep;
  steps: DeploymentStepInfo[];
  isComplete: boolean;
  hasError: boolean;
  startTime?: string;
  endTime?: string;
}

export interface DeploymentConfig {
  network: 'testnet' | 'mainnet';
  fundingAmount: string;
  autoDeploy: boolean;
}
