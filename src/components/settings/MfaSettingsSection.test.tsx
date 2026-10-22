import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MfaSettingsSection } from './MfaSettingsSection';
import { authService } from '@/services/auth.service';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}));

describe('MfaSettingsSection Component', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
    vi.restoreAllMocks();
    vi.spyOn(authService, 'hasRecentAuthentication').mockReturnValue(true);
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      localStorage.clear();
      sessionStorage.clear();
    }
    vi.restoreAllMocks();
  });

  it('requires recent authentication before starting MFA enrollment', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });
    vi.spyOn(authService, 'hasRecentAuthentication')
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const reauthenticate = vi
      .spyOn(authService, 'reauthenticate')
      .mockResolvedValue();
    const initiateSetup = vi.spyOn(authService, 'initiateMfaSetup').mockResolvedValue({
      secret: 'SECRET-KEY-1234',
    });

    render(
      <MfaSettingsSection
        authProvider="email"
        email="test@example.com"
        language="en"
      />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: /set up two-factor authentication/i,
      }),
    );

    expect(
      screen.getByText(/verify your identity before changing mfa settings/i),
    ).toBeInTheDocument();
    expect(initiateSetup).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'current-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify identity/i }));

    expect(await screen.findByText('SECRET-KEY-1234')).toBeInTheDocument();
    expect(reauthenticate).toHaveBeenCalledWith(
      'test@example.com',
      'current-password',
    );
    expect(initiateSetup).toHaveBeenCalledOnce();
  });

  it('does not start MFA enrollment when credential verification is denied', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });
    vi.spyOn(authService, 'hasRecentAuthentication').mockReturnValue(false);
    vi.spyOn(authService, 'reauthenticate').mockRejectedValue(
      new Error('Invalid credentials'),
    );
    const initiateSetup = vi.spyOn(authService, 'initiateMfaSetup');

    render(<MfaSettingsSection email="test@example.com" />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /set up two-factor authentication/i,
      }),
    );
    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: 'wrong-password' },
    });
    fireEvent.click(screen.getByRole('button', { name: /verify identity/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Invalid credentials',
    );
    expect(initiateSetup).not.toHaveBeenCalled();
  });

  it('blocks MFA changes for Google-only accounts without provider re-authentication', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });
    vi.spyOn(authService, 'hasRecentAuthentication').mockReturnValue(false);
    const initiateSetup = vi.spyOn(authService, 'initiateMfaSetup');

    render(<MfaSettingsSection authProvider="google" />);
    fireEvent.click(
      await screen.findByRole('button', {
        name: /set up two-factor authentication/i,
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /provider re-authentication.*not available/i,
    );
    expect(initiateSetup).not.toHaveBeenCalled();
  });

  it('renders in disabled state initially when backend reports disabled', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });

    render(<MfaSettingsSection language="en" />);

    expect(await screen.findByText('Disabled')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /set up two-factor authentication/i })
    ).toBeInTheDocument();
  });

  it('renders in enabled state when backend confirms MFA is already active', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: true,
      supported: true,
    });

    render(<MfaSettingsSection language="en" initialEnabled={true} />);

    expect(await screen.findByText('Enabled')).toBeInTheDocument();
    expect(
      screen.getByText(/mfa is confirmed and active on your account/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /set up two-factor authentication/i })
    ).not.toBeInTheDocument();
  });

  it('displays error and does NOT proceed when backend enrollment is unsupported', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: false,
    });
    vi.spyOn(authService, 'initiateMfaSetup').mockRejectedValueOnce(
      new Error('MFA enrollment is not currently supported by the backend service')
    );

    render(<MfaSettingsSection language="en" />);

    const setupButton = await screen.findByRole('button', {
      name: /set up two-factor authentication/i,
    });
    fireEvent.click(setupButton);

    expect(
      await screen.findByText(/mfa enrollment is not currently supported/i)
    ).toBeInTheDocument();

    // Must remain Disabled
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('transitions to verification state when enrollment succeeds', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });
    vi.spyOn(authService, 'initiateMfaSetup').mockResolvedValueOnce({
      secret: 'SECRET-KEY-1234',
      otpAuthUri: 'otpauth://totp/ChenPilot:user?secret=SECRET-KEY-1234',
    });

    render(<MfaSettingsSection language="en" />);

    const setupButton = await screen.findByRole('button', {
      name: /set up two-factor authentication/i,
    });
    fireEvent.click(setupButton);

    expect(await screen.findByText('SECRET-KEY-1234')).toBeInTheDocument();
    expect(
      screen.getByLabelText(/enter 6-digit code/i)
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verify & enable/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();

    // Verify secrets are NOT in localStorage
    expect(localStorage.getItem('mfa_secret')).toBeNull();
  });

  it('allows cancelling an incomplete setup without enabling MFA', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });
    vi.spyOn(authService, 'initiateMfaSetup').mockResolvedValueOnce({
      secret: 'SECRET-KEY-9999',
    });
    const cancelSpy = vi.spyOn(authService, 'cancelMfaSetup');

    render(<MfaSettingsSection language="en" />);

    const setupButton = await screen.findByRole('button', {
      name: /set up two-factor authentication/i,
    });
    fireEvent.click(setupButton);

    expect(await screen.findByText('SECRET-KEY-9999')).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    // Should return to idle setup button and remain disabled
    expect(
      await screen.findByRole('button', {
        name: /set up two-factor authentication/i,
      })
    ).toBeInTheDocument();
    expect(screen.queryByText('SECRET-KEY-9999')).not.toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
    expect(cancelSpy).toHaveBeenCalled();
  });

  it('handles verification failure without falsely enabling MFA', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });
    vi.spyOn(authService, 'initiateMfaSetup').mockResolvedValueOnce({
      secret: 'SECRET-KEY-1234',
    });
    vi.spyOn(authService, 'verifyMfaSetup').mockRejectedValueOnce(
      new Error('Invalid one-time verification code')
    );

    render(<MfaSettingsSection language="en" />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: /set up two-factor authentication/i,
      })
    );

    const input = await screen.findByLabelText(/enter 6-digit code/i);
    fireEvent.change(input, { target: { value: '111222' } });

    const verifyButton = screen.getByRole('button', { name: /verify & enable/i });
    fireEvent.click(verifyButton);

    expect(
      await screen.findByText(/invalid one-time verification code/i)
    ).toBeInTheDocument();

    // Must NOT be marked enabled
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('confirms enablement when backend confirms verification', async () => {
    vi.spyOn(authService, 'getMfaStatus').mockResolvedValueOnce({
      enabled: false,
      supported: true,
    });
    vi.spyOn(authService, 'initiateMfaSetup').mockResolvedValueOnce({
      secret: 'SECRET-KEY-1234',
    });
    vi.spyOn(authService, 'verifyMfaSetup').mockResolvedValueOnce({
      enabled: true,
      message: 'MFA enabled',
      recoveryCodes: ['REC-1', 'REC-2'],
    });

    render(<MfaSettingsSection language="en" />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: /set up two-factor authentication/i,
      })
    );

    const input = await screen.findByLabelText(/enter 6-digit code/i);
    fireEvent.change(input, { target: { value: '654321' } });

    const verifyButton = screen.getByRole('button', { name: /verify & enable/i });
    fireEvent.click(verifyButton);

    // Displays recovery codes
    expect(await screen.findByText('Save Your Recovery Codes')).toBeInTheDocument();
    expect(screen.getByText('REC-1')).toBeInTheDocument();
    expect(screen.getByText('REC-2')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();

    // Acknowledge recovery codes
    const ackButton = screen.getByRole('button', {
      name: /i have saved my recovery codes/i,
    });
    fireEvent.click(ackButton);

    // Recovery codes purged from DOM
    await waitFor(() => {
      expect(screen.queryByText('REC-1')).not.toBeInTheDocument();
    });

    // Stays enabled
    expect(screen.getByText('Enabled')).toBeInTheDocument();

    // Never stored in localStorage
    expect(localStorage.getItem('mfa_recovery_codes')).toBeNull();
    expect(localStorage.getItem('mfa_secret')).toBeNull();
  });
});
