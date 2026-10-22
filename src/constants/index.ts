// Application constants for ChenPilot client

// API Configuration
export const API_CONFIG = {
  BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:2333',
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
} as const;

export const RETRY_CONFIG = {
  MAX_ATTEMPTS: 3,
  RETRYABLE_STATUS_CODES: [408, 429, ...Array.from({ length: 100 }, (_, index) => 500 + index)],
  IDEMPOTENT_METHODS: ['get', 'head', 'options'],
  BASE_DELAY_MS: 1000,
  MAX_DELAY_MS: 30000,
  JITTER_MS: 1000,
} as const;

// Application Information
export const APP_CONFIG = {
  NAME: 'ChenPilot',
  VERSION: '1.0.0',
  DESCRIPTION: 'AI Co-Pilot for Cross-Chain DeFi and Payments',
  AUTHOR: 'ChenPilot Team',
} as const;

// Token Types
export const TOKEN_TYPES = {
  XLM: 'XLM',
  USDC: 'USDC',
  USDT: 'USDT',
  BTC: 'BTC',
  ETH: 'ETH',
  AQUA: 'AQUA',
} as const;

export const TOKEN_DISPLAY_NAMES = {
  [TOKEN_TYPES.XLM]: 'Stellar Lumens',
  [TOKEN_TYPES.USDC]: 'USD Coin',
  [TOKEN_TYPES.USDT]: 'Tether USD',
  [TOKEN_TYPES.BTC]: 'Bitcoin',
  [TOKEN_TYPES.ETH]: 'Ethereum',
  [TOKEN_TYPES.AQUA]: 'Aquarius Token',
} as const;

// Token Decimals
export const TOKEN_DECIMALS = {
  [TOKEN_TYPES.XLM]: 7,
  [TOKEN_TYPES.USDC]: 7,
  [TOKEN_TYPES.USDT]: 7,
  [TOKEN_TYPES.BTC]: 7,
  [TOKEN_TYPES.ETH]: 7,
  [TOKEN_TYPES.AQUA]: 7,
} as const;

// UI Constants
export const UI_CONFIG = {
  SIDEBAR_WIDTH: 256,
  HEADER_HEIGHT: 64,
  NOTIFICATION_DURATION: 5000,
  DEBOUNCE_DELAY: 300,
  ANIMATION_DURATION: 200,
} as const;

// Theme Colors
export const THEME_COLORS = {
  PRIMARY: {
    50: '#f0f9ff',
    100: '#e0f2fe',
    200: '#bae6fd',
    300: '#7dd3fc',
    400: '#38bdf8',
    500: '#0ea5e9',
    600: '#0284c7',
    700: '#0369a1',
    800: '#075985',
    900: '#0c4a6e',
  },
  STELLAR: {
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
  },
} as const;

// Navigation Items
export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    icon: 'LayoutDashboard',
  },
  {
    id: 'chat',
    label: 'AI Agent',
    href: '/chat',
    icon: 'MessageCircle',
  },
  {
    id: 'contacts',
    label: 'Contacts',
    href: '/contacts',
    icon: 'Users',
  },
  {
    id: 'transactions',
    label: 'Transactions',
    href: '/transactions',
    icon: 'History',
  },
  {
    id: 'settings',
    label: 'Settings',
    href: '/settings',
    icon: 'Settings',
  },
] as const;

// Agent Capabilities
export const AGENT_CAPABILITIES = [
  {
    category: 'Meta Operations',
    commands: [
      'What is your name?',
      'What can you do?',
      'What version are you?',
    ],
  },
  {
    category: 'Wallet Operations',
    commands: [
      'What is my wallet balance?',
      'What is my wallet address?',
      'Show my account status',
    ],
  },
  {
    category: 'Contact Management',
    commands: [
      'Create a contact named John with address 0x123...',
      'List my contacts',
      'Delete contact John',
    ],
  },
  {
    category: 'Trading Operations',
    commands: [
      'Swap 100 USDC to XLM',
      'Show swap rates',
      'Execute trade',
    ],
  },
  {
    category: 'QA Functionality',
    commands: [
      'Can you help me understand how to transfer tokens?',
      'How do I deploy my account?',
      'What is Stellar?',
    ],
  },
] as const;

// Form Validation Messages
export const VALIDATION_MESSAGES = {
  REQUIRED: 'This field is required',
  EMAIL_INVALID: 'Please enter a valid email address',
  PASSWORD_WEAK: 'Password must be at least 8 characters with uppercase, lowercase, and number',
  ADDRESS_INVALID: 'Please enter a valid Stellar address',
  AMOUNT_INVALID: 'Please enter a valid amount',
  PASSWORDS_MISMATCH: "Passwords don't match",
  NAME_TOO_SHORT: 'Name must be at least 2 characters',
  NAME_TOO_LONG: 'Name must be less than 50 characters',
  MESSAGE_TOO_LONG: 'Message is too long (max 1000 characters)',
  // Payment validation messages
  RECIPIENT_ADDRESS_REQUIRED: 'Recipient address is required',
  RECIPIENT_ADDRESS_INVALID: 'Please enter a valid Stellar address (starts with G followed by 55 alphanumeric characters)',
  AMOUNT_REQUIRED: 'Amount is required',
  AMOUNT_INVALID_FORMAT: 'Please enter a valid amount (up to 7 decimal places)',
  AMOUNT_MUST_BE_POSITIVE: 'Amount must be greater than 0',
  AMOUNT_EXCEEDS_MAX: 'Amount cannot exceed 1,000,000',
  AMOUNT_EXCEEDS_MIN: 'Amount must be at least 0.0000001',
  TOKEN_TYPE_REQUIRED: 'Please select a token type',
  MEMO_TOO_LONG: 'Text memo cannot exceed 28 UTF-8 bytes',
  MEMO_TYPE_REQUIRED: 'Memo type is required when memo is provided',
  MEMO_INVALID_FORMAT: 'Invalid memo format for the selected memo type',
  MEMO_ID_INVALID: 'Memo ID must be an unsigned 64-bit integer',
  MEMO_HASH_INVALID: 'Memo hash must be a 64-character hexadecimal string',
} as const;

// Error Messages
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Network error. Please check your connection.',
  UNAUTHORIZED: 'You are not authorized to perform this action.',
  FORBIDDEN: 'Access denied.',
  NOT_FOUND: 'The requested resource was not found.',
  SERVER_ERROR: 'Server error. Please try again later.',
  TIMEOUT: 'Request timed out. Please try again.',
  UNKNOWN_ERROR: 'An unknown error occurred.',
} as const;

// Payment Limits and Configuration
export const PAYMENT_LIMITS = {
  MIN_AMOUNT: 0.0000001,
  MAX_AMOUNT: 1000000,
  MAX_MEMO_LENGTH: 28,
  MAX_DECIMAL_PLACES: 7,
  SUPPORTED_TOKENS: ['XLM', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'] as const,
  MEMO_TYPES: ['none', 'text', 'id', 'hash'] as const,
} as const;

// Security Validation Constants
export const SECURITY_VALIDATION = {
  STELLAR_ADDRESS_REGEX: /^G[A-Z0-9]{55}$/,
  MEMO_ID_REGEX: /^\d{1,20}$/,
  MEMO_HASH_REGEX: /^[a-fA-F0-9]{64}$/,
  AMOUNT_REGEX: /^\d+(\.\d{1,7})?$/,
  MAX_RECIPIENT_ADDRESSES_PER_TRANSACTION: 1,
  RATE_LIMIT_PER_MINUTE: 10,
} as const;

// Success Messages
export const SUCCESS_MESSAGES = {
  LOGIN_SUCCESS: 'Successfully logged in',
  REGISTER_SUCCESS: 'Account created successfully',
  LOGOUT_SUCCESS: 'Successfully logged out',
  PROFILE_UPDATED: 'Profile updated successfully',
  PASSWORD_CHANGED: 'Password changed successfully',
  CONTACT_CREATED: 'Contact created successfully',
  CONTACT_UPDATED: 'Contact updated successfully',
  CONTACT_DELETED: 'Contact deleted successfully',
  ACCOUNT_DEPLOYED: 'Account deployed successfully',
  ACCOUNT_FUNDED: 'Account funded successfully',
  MESSAGE_SENT: 'Message sent successfully',
} as const;

// Local Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'auth_token',
  THEME: 'theme',
  SIDEBAR_STATE: 'sidebar_state',
  USER_PREFERENCES: 'user_preferences',
} as const;

// Query Keys for React Query (if using)
export const QUERY_KEYS = {
  USER_PROFILE: 'user_profile',
  ACCOUNT_STATUS: 'account_status',
  ACCOUNT_BALANCE: 'account_balance',
  CONTACTS: 'contacts',
  CHAT_MESSAGES: 'chat_messages',
  TRANSACTIONS: 'transactions',
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  CONTACTS_PAGE_SIZE: 24,
  MAX_PAGE_SIZE: 100,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

// File Upload
export const FILE_UPLOAD = {
  MAX_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
} as const;

// Animation Durations
export const ANIMATIONS = {
  FAST: 150,
  NORMAL: 200,
  SLOW: 300,
  VERY_SLOW: 500,
} as const;

// Breakpoints (for responsive design)
export const BREAKPOINTS = {
  SM: 640,
  MD: 768,
  LG: 1024,
  XL: 1280,
  '2XL': 1536,
} as const;

// Z-Index Layers
export const Z_INDEX = {
  DROPDOWN: 1000,
  STICKY: 1020,
  FIXED: 1030,
  MODAL_BACKDROP: 1040,
  MODAL: 1050,
  POPOVER: 1060,
  TOOLTIP: 1070,
  TOAST: 1080,
} as const;

// Account Deployment Constants
export const DEPLOYMENT_STEPS = {
  AUTH: {
    id: 'auth' as const,
    title: 'Authentication',
    description: 'Securely authenticate your account',
    icon: 'Shield',
  },
  FUNDING: {
    id: 'funding' as const,
    title: 'Account Funding',
    description: 'Receive initial funding for your account',
    icon: 'Coins',
  },
  DEPLOYMENT: {
    id: 'deployment' as const,
    title: 'Account Deployment',
    description: 'Deploy your smart contract account',
    icon: 'Rocket',
  },
  VERIFICATION: {
    id: 'verification' as const,
    title: 'Verification',
    description: 'Verify account deployment and functionality',
    icon: 'CheckCircle',
  },
  COMPLETE: {
    id: 'complete' as const,
    title: 'Complete',
    description: 'Your account is ready for use',
    icon: 'Sparkles',
  },
} as const;

export const DEPLOYMENT_STATUS = {
  PENDING: 'pending' as const,
  IN_PROGRESS: 'in_progress' as const,
  COMPLETED: 'completed' as const,
  FAILED: 'failed' as const,
} as const;

export const DEPLOYMENT_MESSAGES = {
  AUTH_SUCCESS: 'Authentication successful',
  FUNDING_SUCCESS: 'Account funded successfully',
  DEPLOYMENT_SUCCESS: 'Account deployed successfully',
  VERIFICATION_SUCCESS: 'Account verified successfully',
  AUTH_FAILED: 'Authentication failed',
  FUNDING_FAILED: 'Funding failed',
  DEPLOYMENT_FAILED: 'Deployment failed',
  VERIFICATION_FAILED: 'Verification failed',
  NETWORK_ERROR: 'Network error, please try again',
  TIMEOUT_ERROR: 'Operation timed out',
} as const;

export const DEPLOYMENT_CONFIG = {
  DEFAULT_FUNDING_AMOUNT: '2', // XLM
  MAX_RETRIES: 3,
  RETRY_DELAY: 2000, // ms
  TIMEOUT: 30000, // ms
} as const;
