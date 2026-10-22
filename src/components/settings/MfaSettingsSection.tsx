'use client';

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { authService } from '@/services/auth.service';
import { t, Language } from '@/lib/i18n/i18n';
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

export type MfaFlowState =
  | 'idle' // Checking status or resting in current status
  | 'enrolling' // In-flight enrollment initiation
  | 'awaiting_verification' // Secret/QR displayed, user enters 6-digit code
  | 'verifying' // In-flight code verification
  | 'recovery_display' // Showing recovery codes immediately after verification
  | 'error'; // Error state

interface MfaSettingsSectionProps {
  language?: Language;
  initialEnabled?: boolean;
  email?: string;
  authProvider?: 'email' | 'google';
}

export function MfaSettingsSection({
  language = 'en',
  initialEnabled = false,
  email = '',
  authProvider = 'email',
}: MfaSettingsSectionProps) {
  const [isEnabled, setIsEnabled] = useState<boolean>(initialEnabled);
  const [flowState, setFlowState] = useState<MfaFlowState>('idle');
  const [isCheckingStatus, setIsCheckingStatus] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Transient sensitive state — ONLY in component memory, NEVER in localStorage
  const [secret, setSecret] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState<boolean>(false);
  const [reauthenticationPassword, setReauthenticationPassword] = useState('');
  const [reauthenticationError, setReauthenticationError] = useState<string | null>(null);
  const [isReauthenticating, setIsReauthenticating] = useState(false);
  const [showReauthentication, setShowReauthentication] = useState(false);

  const isMountedRef = useRef<boolean>(true);
  const pendingProtectedActionRef = useRef<(() => Promise<void>) | null>(null);

  const requireRecentAuthentication = (action: () => Promise<void>) => {
    if (authService.hasRecentAuthentication()) return true;

    if (authProvider === 'google') {
      setReauthenticationError(
        'MFA changes require provider re-authentication, which is not available for this Google-only account.',
      );
      return false;
    }

    pendingProtectedActionRef.current = action;
    setReauthenticationError(null);
    setReauthenticationPassword('');
    setShowReauthentication(true);
    return false;
  };

  // Clear all transient sensitive state
  const clearSensitiveState = () => {
    setSecret(null);
    setQrCodeDataUrl(null);
    setVerificationCode('');
    setRecoveryCodes([]);
    setCopiedSecret(false);
    authService.cancelMfaSetup();
  };

  useEffect(() => {
    isMountedRef.current = true;

    // Check initial backend status
    let active = true;
    setIsCheckingStatus(true);
    authService
      .getMfaStatus()
      .then((status) => {
        if (active && isMountedRef.current) {
          setIsEnabled(status.enabled);
        }
      })
      .catch(() => {
        // Fallback: leave disabled
      })
      .finally(() => {
        if (active && isMountedRef.current) {
          setIsCheckingStatus(false);
        }
      });

    return () => {
      active = false;
      isMountedRef.current = false;
      // Clean up sensitive data on unmount
      clearSensitiveState();
    };
  }, []);

  const handleStartSetup = async () => {
    if (!requireRecentAuthentication(handleStartSetup)) return;

    setErrorMessage(null);
    setFlowState('enrolling');

    try {
      const enrollment = await authService.initiateMfaSetup();
      if (!isMountedRef.current) return;

      setSecret(enrollment.secret);

      // Generate QR Code if an otpAuthUri or secret is provided
      if (enrollment.qrCodeUrl) {
        setQrCodeDataUrl(enrollment.qrCodeUrl);
      } else if (enrollment.otpAuthUri) {
        try {
          const dataUrl = await QRCode.toDataURL(enrollment.otpAuthUri);
          if (isMountedRef.current) {
            setQrCodeDataUrl(dataUrl);
          }
        } catch {
          // If QR code generation fails, user can still enter the manual secret
        }
      } else if (enrollment.secret) {
        try {
          const otpAuth = `otpauth://totp/ChenPilot:Account?secret=${enrollment.secret}&issuer=ChenPilot`;
          const dataUrl = await QRCode.toDataURL(otpAuth);
          if (isMountedRef.current) {
            setQrCodeDataUrl(dataUrl);
          }
        } catch {
          // Fallback to manual secret
        }
      }

      setFlowState('awaiting_verification');
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg =
        (err as { message?: string }).message ||
        'Failed to start MFA setup. Backend MFA enrollment contract may not be supported.';
      setErrorMessage(msg);
      setFlowState('error');
      clearSensitiveState();
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!requireRecentAuthentication(() => handleVerify())) return;

    const code = verificationCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('Please enter a valid 6-digit code.');
      return;
    }

    setErrorMessage(null);
    setFlowState('verifying');

    try {
      const result = await authService.verifyMfaSetup(code);
      if (!isMountedRef.current) return;

      if (result.enabled) {
        setIsEnabled(true);
        if (result.recoveryCodes && result.recoveryCodes.length > 0) {
          setRecoveryCodes(result.recoveryCodes);
          setFlowState('recovery_display');
        } else {
          setFlowState('idle');
          clearSensitiveState();
          toast.success('Two-factor authentication enabled successfully');
        }
      } else {
        throw new Error('Backend did not confirm MFA enablement');
      }
    } catch (err: unknown) {
      if (!isMountedRef.current) return;
      const msg =
        (err as { message?: string }).message ||
        'Verification failed. Please check the 6-digit code and try again.';
      setErrorMessage(msg);
      // Stay in awaiting_verification so user can re-try without re-enrolling
      setFlowState('awaiting_verification');
    }
  };

  const handleCancel = () => {
    clearSensitiveState();
    setErrorMessage(null);
    setFlowState('idle');
  };

  const handleReauthentication = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setReauthenticationError(null);
    setIsReauthenticating(true);

    try {
      await authService.reauthenticate(email, reauthenticationPassword);
      setReauthenticationPassword('');
      const pendingAction = pendingProtectedActionRef.current;
      pendingProtectedActionRef.current = null;
      setShowReauthentication(false);
      if (pendingAction) await pendingAction();
    } catch (error) {
      setReauthenticationError(
        error instanceof Error ? error.message : 'Re-authentication failed',
      );
    } finally {
      setIsReauthenticating(false);
    }
  };

  const handleCancelReauthentication = () => {
    pendingProtectedActionRef.current = null;
    setReauthenticationPassword('');
    setReauthenticationError(null);
    setShowReauthentication(false);
    authService.clearRecentAuthentication();
  };

  const handleCopySecret = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopiedSecret(true);
      toast.success('Secret key copied to clipboard');
      setTimeout(() => {
        if (isMountedRef.current) setCopiedSecret(false);
      }, 2500);
    }
  };

  const handleAcknowledgeRecovery = () => {
    clearSensitiveState();
    setFlowState('idle');
    toast.success('Two-factor authentication is active');
  };

  return (
    <Card className="border border-gray-800 bg-gray-900/40">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-base font-semibold text-white">
                {t(language, 'settings.mfaTitle') !== 'settings.mfaTitle'
                  ? t(language, 'settings.mfaTitle')
                  : 'Two-Factor Authentication (2FA)'}
              </h4>
              <p className="text-xs text-gray-400">
                {t(language, 'settings.mfaDescription') !== 'settings.mfaDescription'
                  ? t(language, 'settings.mfaDescription')
                  : 'Protect your account transactions with an authenticator app (TOTP).'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {isCheckingStatus ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400">
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Checking...
              </span>
            ) : isEnabled ? (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Enabled
              </span>
            ) : (
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
                <ShieldAlert className="h-3.5 w-3.5 mr-1" />
                Disabled
              </span>
            )}
          </div>
        </div>

        {showReauthentication && authProvider !== 'google' && (
          <form
            className="mb-4 space-y-3 rounded-lg border border-gray-700 bg-black/30 p-4"
            onSubmit={handleReauthentication}
          >
            <p className="text-sm text-gray-300">
              Verify your identity before changing MFA settings.
            </p>
            <Input
              aria-label="Current password for MFA verification"
              autoComplete="current-password"
              label="Current password"
              onChange={(event) =>
                setReauthenticationPassword(event.target.value)
              }
              required
              type="password"
              value={reauthenticationPassword}
            />
            {reauthenticationError && (
              <p className="text-sm text-red-400" role="alert">
                {reauthenticationError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                disabled={isReauthenticating}
                onClick={handleCancelReauthentication}
                type="button"
                variant="ghost"
              >
                Cancel
              </Button>
              <Button
                disabled={isReauthenticating}
                loading={isReauthenticating}
                type="submit"
              >
                Verify identity
              </Button>
            </div>
          </form>
        )}
        {reauthenticationError && authProvider === 'google' && (
          <p className="mb-4 text-sm text-red-400" role="alert">
            {reauthenticationError}
          </p>
        )}

        {/* Global / Flow Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start space-x-2"
          >
            <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-red-200">Authentication Error</p>
              <p>{errorMessage}</p>
            </div>
          </div>
        )}

        {/* State: Disabled & Idle */}
        {flowState === 'idle' && !isEnabled && (
          <div className="pt-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleStartSetup}
              disabled={isCheckingStatus}
            >
              Set Up Two-Factor Authentication
            </Button>
          </div>
        )}

        {/* State: Enabled & Idle */}
        {flowState === 'idle' && isEnabled && (
          <div className="pt-2 text-xs text-gray-400 flex items-center space-x-2">
            <Check className="h-4 w-4 text-green-400" />
            <span>MFA is confirmed and active on your account.</span>
          </div>
        )}

        {/* State: Enrolling (loading setup) */}
        {flowState === 'enrolling' && (
          <div className="py-4 flex items-center space-x-3 text-sm text-gray-300">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
            <span>Requesting enrollment from server...</span>
          </div>
        )}

        {/* State: Awaiting Verification */}
        {(flowState === 'awaiting_verification' || flowState === 'verifying') && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
            <div className="bg-gray-950/60 p-4 rounded-lg border border-gray-800 space-y-4">
              <h5 className="text-sm font-medium text-white">
                1. Scan QR Code or Enter Secret
              </h5>
              <p className="text-xs text-gray-400">
                Scan this code in your authenticator app (Google Authenticator, Authy, 1Password)
                or enter the key manually:
              </p>

              {qrCodeDataUrl ? (
                <div className="flex justify-center p-3 bg-white rounded-lg w-fit mx-auto shadow">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrCodeDataUrl}
                    alt="MFA QR Code"
                    className="h-40 w-40 object-contain"
                  />
                </div>
              ) : (
                <div className="p-3 bg-gray-900 rounded text-center text-xs text-gray-400 font-mono">
                  Manual Entry Key
                </div>
              )}

              {secret && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-400 font-medium">Key:</span>
                  <code className="flex-1 px-2.5 py-1.5 bg-black rounded font-mono text-xs text-indigo-300 tracking-wider select-all break-all border border-gray-800">
                    {secret}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopySecret}
                    className="!p-2 text-gray-300 hover:text-white"
                    title="Copy Secret"
                  >
                    {copiedSecret ? (
                      <Check className="h-4 w-4 text-green-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </div>

            <form onSubmit={handleVerify} className="space-y-3">
              <div>
                <label
                  htmlFor="mfa-verification-code"
                  className="block text-xs font-medium text-gray-300 mb-1"
                >
                  2. Enter 6-digit Code
                </label>
                <Input
                  id="mfa-verification-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={verificationCode}
                  onChange={(e) =>
                    setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                  }
                  className="font-mono text-center tracking-widest text-lg"
                  autoFocus
                />
              </div>

              <div className="flex items-center space-x-3 pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={verificationCode.length !== 6 || flowState === 'verifying'}
                  loading={flowState === 'verifying'}
                >
                  {flowState === 'verifying' ? 'Verifying...' : 'Verify & Enable'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  disabled={flowState === 'verifying'}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* State: Recovery Codes Display */}
        {flowState === 'recovery_display' && (
          <div className="mt-4 pt-4 border-t border-gray-800 space-y-4">
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
              <p className="font-semibold text-sm mb-1">Save Your Recovery Codes</p>
              <p>
                Store these single-use recovery codes in a secure location. If you lose access to
                your authenticator device, recovery codes are the only way to regain access.
                They will <strong>not</strong> be shown again and are never stored in your browser.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-3 bg-black rounded-lg border border-gray-800 font-mono text-xs text-gray-200">
              {recoveryCodes.map((code, idx) => (
                <div key={idx} className="p-1 text-center bg-gray-900/60 rounded">
                  {code}
                </div>
              ))}
            </div>

            <div className="pt-2">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleAcknowledgeRecovery}
              >
                I Have Saved My Recovery Codes
              </Button>
            </div>
          </div>
        )}

        {/* State: Error with Retry or Cancel */}
        {flowState === 'error' && !isEnabled && (
          <div className="pt-2 flex items-center space-x-3">
            <Button type="button" variant="primary" size="sm" onClick={handleStartSetup}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
              Try Again
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default MfaSettingsSection;
