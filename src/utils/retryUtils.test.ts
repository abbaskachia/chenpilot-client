import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { isRetryableError } from './retryUtils';

function makeAxiosError(options: {
  method: string;
  status?: number;
  paymentOperation?: boolean;
}): AxiosError {
  return {
    config: {
      method: options.method,
      url: options.paymentOperation ? '/payments' : '/health',
      paymentOperation: options.paymentOperation,
      _retryCount: 0,
    },
    response: options.status === undefined ? undefined : {
      status: options.status,
      statusText: 'error',
      headers: {},
      config: {} as never,
      data: {},
    },
  } as unknown as AxiosError;
}

describe('payment retry safety', () => {
  it('never retries a payment operation, including 503 responses', () => {
    expect(isRetryableError(makeAxiosError({ method: 'post', status: 503, paymentOperation: true }))).toBe(false);
    expect(isRetryableError(makeAxiosError({ method: 'post', paymentOperation: true }))).toBe(false);
  });

  it('continues to retry eligible idempotent requests', () => {
    expect(isRetryableError(makeAxiosError({ method: 'get', status: 503 }))).toBe(true);
  });
});
