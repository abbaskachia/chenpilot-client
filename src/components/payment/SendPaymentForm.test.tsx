import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SendPaymentForm from './SendPaymentForm';
import { PaymentOutcomeUnknownError } from '@/utils/paymentOutcome';

const recipientAddress = `G${'A'.repeat(55)}`;

async function fillPaymentForm() {
  fireEvent.change(screen.getByPlaceholderText('GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'), {
    target: { value: recipientAddress },
  });
  fireEvent.change(screen.getByPlaceholderText('0.00'), {
    target: { value: '1.25' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review Payment' }));
  await screen.findByRole('dialog');
}

describe('SendPaymentForm review and result states', () => {
  it('requires explicit confirmation and submits the exact reviewed values', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ status: 'submitted', transactionHash: 'hash-123' });
    const onCheckStatus = vi.fn();
    render(<SendPaymentForm contacts={[]} onSubmit={onSubmit} onCheckStatus={onCheckStatus} />);

    await fillPaymentForm();

    expect(onSubmit).not.toHaveBeenCalled();
    const dialogText = screen.getByRole('dialog').textContent ?? '';
    expect(dialogText).toContain(recipientAddress);
    expect(dialogText).toContain('1.25 XLM');
    expect(dialogText).toContain('No memo');
    expect(dialogText).toContain('Network unknown');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    await screen.findByText('Payment submitted');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      recipientAddress,
      amount: '1.25',
      tokenType: 'XLM',
      memoType: 'none',
    });
    expect(onSubmit.mock.calls[0][1]).toEqual(expect.any(String));
    expect(screen.getByText('hash-123')).toBeTruthy();
  });

  it('allows returning to edit without losing the entered payment', async () => {
    render(<SendPaymentForm contacts={[]} onSubmit={vi.fn()} onCheckStatus={vi.fn()} />);
    await fillPaymentForm();

    fireEvent.click(screen.getByRole('button', { name: 'Return to edit' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getByPlaceholderText('0.00') as HTMLInputElement).value).toBe('1.25');
    expect((screen.getByPlaceholderText('GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890') as HTMLInputElement).value).toBe(recipientAddress);
  });

  it('offers status checking, not a second send, after an uncertain result', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onSubmit = vi.fn().mockRejectedValue(new PaymentOutcomeUnknownError('Outcome unknown'));
    const onCheckStatus = vi.fn().mockResolvedValue({ status: 'confirmed', transactionId: 'tx-456' });
    render(<SendPaymentForm contacts={[]} onSubmit={onSubmit} onCheckStatus={onCheckStatus} />);

    await fillPaymentForm();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and send' }));
    await screen.findByText('Payment status unknown');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Check payment status' }));
    await screen.findByText('Payment confirmed');

    expect(onCheckStatus).toHaveBeenCalledWith(onSubmit.mock.calls[0][1]);
    expect(screen.getByText('tx-456')).toBeTruthy();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
