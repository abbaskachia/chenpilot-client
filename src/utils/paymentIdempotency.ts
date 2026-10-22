import { SendPaymentRequest } from '@/types';

export const buildPaymentIdempotencyKey = (
  data: Pick<SendPaymentRequest, 'recipientAddress' | 'amount' | 'tokenType' | 'memo' | 'memoType' | 'recipientContactId'>,
): string => {
  const normalizedRequest = {
    recipientAddress: data.recipientAddress?.trim() ?? '',
    amount: data.amount?.trim() ?? '',
    tokenType: data.tokenType ?? '',
    memo: data.memo?.trim() ?? '',
    memoType: data.memoType ?? 'none',
    recipientContactId: data.recipientContactId ?? '',
  };

  const payload = JSON.stringify(normalizedRequest);
  let hash = 2166136261;

  for (let index = 0; index < payload.length; index += 1) {
    hash = Math.imul(hash ^ payload.charCodeAt(index), 16777619);
  }

  return `pay-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
