export class PaymentOutcomeUnknownError extends Error {
  readonly outcomeUnknown = true;

  constructor(message = 'The payment outcome could not be confirmed.') {
    super(message);
    this.name = 'PaymentOutcomeUnknownError';
  }
}

export function isPaymentOutcomeUnknown(error: unknown): boolean {
  if (error instanceof PaymentOutcomeUnknownError) {
    return true;
  }

  if (!error || typeof error !== 'object') {
    return false;
  }

  const config = 'config' in error
    ? (error as { config?: { paymentOperation?: boolean } }).config
    : undefined;

  const response = 'response' in error
    ? (error as { response?: { status?: number } }).response
    : undefined;
  const status = response?.status;

  if (status === undefined) {
    return Boolean(config?.paymentOperation);
  }

  return status === 408 || (status >= 500 && status <= 599);
}

export function createPaymentIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}