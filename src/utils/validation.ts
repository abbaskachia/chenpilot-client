import { z } from 'zod';
import { VALIDATION_MESSAGES, PAYMENT_LIMITS, SECURITY_VALIDATION, TOKEN_DECIMALS } from '@/constants';

// Email validation schema
export const emailSchema = z
  .string()
  .min(1, 'Email is required')
  .email('Please enter a valid email address');

// Password validation schema
export const passwordSchema = z
  .string()
  .min(1, 'Password is required')
  .min(8, 'Password must be at least 8 characters')
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one uppercase letter, one lowercase letter, and one number');

// Name validation schema
export const nameSchema = z
  .string()
  .min(1, 'Name is required')
  .min(2, 'Name must be at least 2 characters')
  .max(50, 'Name must be less than 50 characters');

// Stellar address validation schema
export const stellarAddressSchema = z
  .string()
  .min(1, VALIDATION_MESSAGES.ADDRESS_INVALID)
  .regex(SECURITY_VALIDATION.STELLAR_ADDRESS_REGEX, VALIDATION_MESSAGES.RECIPIENT_ADDRESS_INVALID);

// Keep for backward compatibility
export const starknetAddressSchema = stellarAddressSchema;

// Token amount validation schema
export const tokenAmountSchema = z
  .string()
  .min(1, VALIDATION_MESSAGES.AMOUNT_REQUIRED)
  .regex(SECURITY_VALIDATION.AMOUNT_REGEX, VALIDATION_MESSAGES.AMOUNT_INVALID_FORMAT)
  .refine((val) => parseFloat(val) > 0, VALIDATION_MESSAGES.AMOUNT_MUST_BE_POSITIVE);

export const getAssetPrecision = (tokenType?: string): number => {
  const normalizedType = (tokenType ?? 'XLM').toUpperCase();
  const precision = TOKEN_DECIMALS[normalizedType as keyof typeof TOKEN_DECIMALS];
  return typeof precision === 'number' ? precision : 7;
};

export const hasValidAssetPrecision = (amount: string, tokenType?: string): boolean => {
  if (!amount || Number.isNaN(Number(amount))) {
    return false;
  }

  const precision = getAssetPrecision(tokenType);
  const [, fractionalPart = ''] = amount.split('.');
  return fractionalPart.length <= precision;
};

// Contact validation schemas
export const createContactSchema = z.object({
  name: nameSchema,
  address: stellarAddressSchema,
  tokenType: z.enum(['XLM', 'STRK', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA'], {
    required_error: 'Please select a token type',
  }),
  note: z.string().max(280, 'Contact notes are limited to 280 characters').optional(),
});

export const updateContactSchema = z.object({
  name: nameSchema.optional(),
  address: stellarAddressSchema.optional(),
  tokenType: z.enum(['XLM', 'STRK', 'USDC', 'USDT', 'BTC', 'ETH', 'AQUA']).optional(),
  note: z.string().max(280, 'Contact notes are limited to 280 characters').optional(),
});

// Authentication schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema.optional(),
}).refine((data) => {
  // Additional validation to ensure all required fields are present
  return data.email && data.password && typeof data.email === 'string' && typeof data.password === 'string';
}, {
  message: "All required fields must be provided",
  path: ["email"]
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Agent query validation
export const agentQuerySchema = z.object({
  query: z.string().min(1, 'Please enter a message').max(1000, 'Message is too long'),
});

// Send Payment validation schema
export const sendPaymentSchema = z.object({
  recipientAddress: stellarAddressSchema,
  amount: z
    .string()
    .min(1, VALIDATION_MESSAGES.AMOUNT_REQUIRED)
    .regex(SECURITY_VALIDATION.AMOUNT_REGEX, VALIDATION_MESSAGES.AMOUNT_INVALID_FORMAT)
    .refine((val) => parseFloat(val) > 0, VALIDATION_MESSAGES.AMOUNT_MUST_BE_POSITIVE)
    .refine((val) => parseFloat(val) >= PAYMENT_LIMITS.MIN_AMOUNT, VALIDATION_MESSAGES.AMOUNT_EXCEEDS_MIN)
    .refine((val) => parseFloat(val) <= PAYMENT_LIMITS.MAX_AMOUNT, VALIDATION_MESSAGES.AMOUNT_EXCEEDS_MAX),
  tokenType: z.enum(PAYMENT_LIMITS.SUPPORTED_TOKENS, {
    required_error: VALIDATION_MESSAGES.TOKEN_TYPE_REQUIRED,
  }),
  memo: z.string().optional(),
  memoType: z.enum(PAYMENT_LIMITS.MEMO_TYPES).optional(),
  recipientContactId: z.string().optional(),
}).superRefine((data, context) => {
  const precision = getAssetPrecision(data.tokenType);
  const decimalPart = data.amount.split('.')[1] ?? '';

  if (decimalPart.length > precision) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Amount exceeds ${precision} decimal places for ${data.tokenType}.`,
      path: ['amount'],
    });
  }

  if (data.memo && data.memo.length > 0 && !data.memoType) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: VALIDATION_MESSAGES.MEMO_TYPE_REQUIRED,
      path: ['memoType'],
    });
    return;
  }

  if (data.memo && data.memoType === 'id') {
    if (!SECURITY_VALIDATION.MEMO_ID_REGEX.test(data.memo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: VALIDATION_MESSAGES.MEMO_ID_INVALID,
        path: ['memo'],
      });
    }
  }

  if (data.memo && data.memoType === 'hash') {
    if (!SECURITY_VALIDATION.MEMO_HASH_REGEX.test(data.memo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: VALIDATION_MESSAGES.MEMO_HASH_INVALID,
        path: ['memo'],
      });
    }
  }
});

// Utility functions for validation
export const validateEmail = (email: string): boolean => {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
};

export const validatePassword = (password: string): boolean => {
  try {
    passwordSchema.parse(password);
    return true;
  } catch {
    return false;
  }
};

export const validateStellarAddress = (address: string): boolean => {
  try {
    stellarAddressSchema.parse(address);
    return true;
  } catch {
    return false;
  }
};

// Keep for backward compatibility
export const validateStarknetAddress = validateStellarAddress;

export const validateTokenAmount = (amount: string): boolean => {
  try {
    tokenAmountSchema.parse(amount);
    return true;
  } catch {
    return false;
  }
};

// Send payment validation utility functions
export const validateSendPayment = (data: {
  recipientAddress: string;
  amount: string;
  tokenType: string;
  memo?: string;
  memoType?: string;
  recipientContactId?: string;
  idempotencyKey?: string;
}): { isValid: boolean; errors: string[] } => {
  try {
    sendPaymentSchema.parse(data);
    return { isValid: true, errors: [] };
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      const issues = error.issues ?? error.errors ?? [];
      const errors = issues.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`);
      return { isValid: false, errors };
    }
    return { isValid: false, errors: ['Validation failed'] };
  }
};

export const getPaymentFailureMessage = (error: unknown): string => {
  let message = error instanceof Error ? error.message : String(error || '');

  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') {
      message = response.data.message;
    }
  }

  const normalizedMessage = message.toLowerCase();

  if (/account.*not.*exist|destination.*not.*activated|destination.*not.*exist|not.*activated|activate.*account|account.*does not exist/i.test(message)) {
    return 'This Stellar destination is not activated yet. The recipient must activate the account and hold the required minimum balance before this payment can succeed.';
  }

  if (/reserve|minimum\s+(native\s+)?balance|insufficient\s+native\s+balance|insufficient.*funds|not enough.*balance/i.test(normalizedMessage)) {
    return "This payment would leave too little XLM to meet Stellar's minimum account reserve. Reduce the amount or add XLM.";
  }

  if (/not enough.*balance|amount.*exceeds.*balance/i.test(normalizedMessage)) {
    return 'The requested amount exceeds the available balance for this asset.';
  }

  return message || 'Failed to send payment';
};

export const validateMemo = (memo: string, memoType: string): boolean => {
  if (memoType === 'none') return true;
  if (!memo || memo.trim().length === 0) return false;
  
  if (memoType === 'id') {
    return SECURITY_VALIDATION.MEMO_ID_REGEX.test(memo) && BigInt(memo) <= 18446744073709551615n;
  }
  if (memoType === 'hash') {
    return SECURITY_VALIDATION.MEMO_HASH_REGEX.test(memo);
  }
  if (memoType === 'text') {
    return new TextEncoder().encode(memo).length <= PAYMENT_LIMITS.MAX_MEMO_LENGTH;
  }
  return false;
};

export const validateAmountRange = (
  amount: string,
  min: number = PAYMENT_LIMITS.MIN_AMOUNT,
  max: number = PAYMENT_LIMITS.MAX_AMOUNT
): boolean => {
  const numAmount = parseFloat(amount);
  if (isNaN(numAmount)) return false;
  return numAmount >= min && numAmount <= max;
};

export const sanitizePaymentInput = (data: {
  recipientAddress: string;
  amount: string;
  tokenType: string;
  memo?: string;
  memoType?: string;
  recipientContactId?: string;
  idempotencyKey?: string;
}): {
  recipientAddress: string;
  amount: string;
  tokenType: string;
  memo?: string;
  memoType?: string;
  recipientContactId?: string;
  idempotencyKey?: string;
} => {
  return {
    recipientAddress: data.recipientAddress.trim(),
    amount: data.amount.trim(),
    tokenType: data.tokenType.toUpperCase(),
    ...(data.memoType?.toLowerCase() === 'none'
      ? {}
      : data.memo?.trim()
        ? { memo: data.memo.trim() }
        : {}),
    memoType: data.memoType?.toLowerCase(),
    recipientContactId: data.recipientContactId?.trim(),
    idempotencyKey: data.idempotencyKey?.trim() || undefined,
  };
};
