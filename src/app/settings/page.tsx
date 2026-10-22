"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/store";
import { fetchProfile, logout } from "@/store/slices/authSlice";
import { setLanguage } from "@/store/slices/uiSlice";
import { ChatLayout } from "@/components/layout/ChatLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { t, LANGUAGES } from "@/lib/i18n/i18n";
import { MfaSettingsSection } from "@/components/settings/MfaSettingsSection";
import { DangerZone } from "@/components/settings/DangerZone";
import apiService from "@/services/api";
import authService from "@/services/auth.service";
import { StellarNetworkBadge } from "@/components/wallet/StellarNetworkBadge";
import toast from "react-hot-toast";
import { PasswordStrengthMeter } from "@/components/auth/(register)/passwordStrengthMeter";
import { changePasswordSchema } from "@/utils/validation";

export default function SettingsPage() {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user, isLoading } = useAppSelector(
    (state) => state.auth,
  );
  const { theme, language } = useAppSelector((state) => state.ui) || {
    mode: "dark",
    language: "en",
  };
  const [passwordChangeStage, setPasswordChangeStage] = useState<
    "reauthenticate" | "change-password" | null
  >(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [isSecurityActionLoading, setIsSecurityActionLoading] = useState(false);
  const [deletionStatus, setDeletionStatus] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(fetchProfile());
    }
  }, [isAuthenticated, dispatch]);

  useEffect(() => {
    authService.clearRecentAuthentication();
    return () => authService.clearRecentAuthentication();
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  const avatarInitials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  const handleLanguageChange = (lang: "en" | "ar" | "es" | "fr") => {
    dispatch(setLanguage(lang));
  };

  const closePasswordChange = () => {
    authService.clearRecentAuthentication();
    setPasswordChangeStage(null);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSecurityError("");
  };

  const handleReauthentication = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSecurityError("");
    setIsSecurityActionLoading(true);

    try {
      await authService.reauthenticate(user?.email ?? "", currentPassword);
      setPasswordChangeStage("change-password");
    } catch (error) {
      setSecurityError(
        error instanceof Error ? error.message : "Re-authentication failed",
      );
    } finally {
      setIsSecurityActionLoading(false);
    }
  };

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSecurityError("");

    if (!authService.hasRecentAuthentication()) {
      setCurrentPassword("");
      setPasswordChangeStage("reauthenticate");
      setSecurityError(
        "Your verification expired. Please verify your identity again.",
      );
      return;
    }

    const validation = changePasswordSchema.safeParse({
      currentPassword,
      newPassword,
      confirmPassword,
    });
    if (!validation.success) {
      setSecurityError(validation.error.issues[0]?.message ?? "Invalid password");
      return;
    }

    setIsSecurityActionLoading(true);
    try {
      const response = await apiService.changePassword(
        currentPassword,
        newPassword,
      );
      if (!response.success) {
        throw new Error(response.message || "Password change failed");
      }
      toast.success("Password changed successfully");
      closePasswordChange();
    } catch (error) {
      setSecurityError(
        error instanceof Error ? error.message : "Password change failed",
      );
    } finally {
      setIsSecurityActionLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await apiService.deleteAccount();
      const remaining = result.remaining.length
        ? ` Remaining: ${result.remaining.join(", ")}.`
        : "";
      const removed = result.removed.length
        ? ` Removed: ${result.removed.join(", ")}.`
        : "";
      if (!result.api) {
        setDeletionStatus(`API deletion failed.${removed}${remaining} On-chain history cannot be deleted.`);
      } else if (result.remaining.length) {
        setDeletionStatus(`Account deletion partially completed.${removed}${remaining} On-chain history cannot be deleted.`);
      } else {
        setDeletionStatus("Account deleted. On-chain history cannot be deleted.");
        await dispatch(logout());
      }
    } catch (error) {
      setDeletionStatus(
        error instanceof Error ? error.message : "Account deletion failed.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ChatLayout>
      <div className="h-full flex flex-col bg-black text-white overflow-hidden relative">
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]" />
        </div>
        <div className="flex-1 overflow-auto relative z-10">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-white mb-2">
                {t(language, "settings.title")}
              </h1>
              <p className="text-gray-300">
                {t(language, "settings.description")}
              </p>
            </div>

            <div className="space-y-6">
              {/* Profile Settings */}
              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white mb-4">
                    {t(language, "settings.profile")}
                  </h3>
                  {isLoading ? (
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="animate-pulse h-16 w-16 rounded-full bg-gray-700" />
                      <div className="space-y-2">
                        <div className="animate-pulse h-4 w-32 bg-gray-700 rounded" />
                        <div className="animate-pulse h-3 w-48 bg-gray-700 rounded" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-4 mb-6">
                      <div className="h-16 w-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                        {avatarInitials}
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {user?.name || "—"}
                        </p>
                        <p className="text-gray-400 text-sm">
                          {user?.email || "—"}
                        </p>
                        <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-300 capitalize">
                          {user?.authProvider ?? "email"}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="space-y-4">
                    <Input
                      label="Name"
                      value={user?.name || ""}
                      disabled
                      placeholder="Your display name"
                    />
                    <Input
                      label="Email"
                      value={user?.email || ""}
                      disabled
                      placeholder="Your email address"
                    />
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-gray-300">Wallet Address</span>
                        <StellarNetworkBadge />
                      </div>
                      <Input
                        value={user?.address || ""}
                        disabled
                        aria-label="Wallet Address"
                        placeholder="Your Stellar wallet address"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Appearance Settings */}
              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white mb-4">
                    {t(language, "settings.appearance")}
                  </h3>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      {t(language, "settings.theme")}
                    </label>
                    <div className="flex space-x-4">
                      <Button
                        variant={theme.mode === "light" ? "primary" : "ghost"}
                        size="sm"
                      >
                        {t(language, "settings.light")}
                      </Button>
                      <Button
                        variant={theme.mode === "dark" ? "primary" : "ghost"}
                        size="sm"
                      >
                        {t(language, "settings.dark")}
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Language Settings */}
              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white mb-4">
                    {t(language, "settings.language")}
                  </h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {LANGUAGES.map((lang) => (
                      <Button
                        key={lang.code}
                        variant={language === lang.code ? "primary" : "ghost"}
                        size="sm"
                        onClick={() =>
                          handleLanguageChange(
                            lang.code as "en" | "ar" | "es" | "fr",
                          )
                        }
                        className="w-full"
                      >
                        {lang.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Notifications */}
              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white mb-4">
                    {t(language, "settings.notifications")}
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          Transaction Notifications
                        </p>
                        <p className="text-sm text-gray-400">
                          Get notified when transactions complete
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        defaultChecked
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white">
                          Chat Notifications
                        </p>
                        <p className="text-sm text-gray-400">
                          Get notified of new AI agent responses
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        defaultChecked
                        className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                      />
                    </div>
                  </div>
                </div>
              </Card>

              {/* Security */}
              <Card>
                <div className="p-6">
                  <h3 className="text-lg font-medium text-white mb-4">
                    {t(language, "settings.security")}
                  </h3>
                  <div className="space-y-4">
                    <MfaSettingsSection
                      authProvider={user?.authProvider}
                      email={user?.email}
                      language={language}
                    />
                    {user?.authProvider === "google" ? (
                      <div>
                        <Button
                          disabled
                          variant="ghost"
                          className="w-full justify-start"
                        >
                          Change Password
                        </Button>
                        <p className="mt-2 text-sm text-gray-400">
                          Password changes are unavailable for Google sign-in
                          accounts.
                        </p>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="w-full justify-start"
                        onClick={() => {
                          setCurrentPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                          setSecurityError("");
                          setPasswordChangeStage("reauthenticate");
                        }}
                      >
                        Change Password
                      </Button>
                    )}
                    <DangerZone
                      email={user?.email || ""}
                      disabled={isDeleting}
                      onDelete={handleDeleteAccount}
                    />
                    {deletionStatus ? (
                      <p className="text-sm text-amber-400">{deletionStatus}</p>
                    ) : null}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
        {passwordChangeStage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="presentation"
          >
            <section
              aria-labelledby="password-change-title"
              aria-modal="true"
              className="w-full max-w-md rounded-lg border border-gray-700 bg-gray-900 p-6 shadow-xl"
              role="dialog"
            >
              <h2
                className="mb-4 text-lg font-semibold text-white"
                id="password-change-title"
              >
                {passwordChangeStage === "reauthenticate"
                  ? "Verify your identity"
                  : "Change password"}
              </h2>
              <form
                onSubmit={
                  passwordChangeStage === "reauthenticate"
                    ? handleReauthentication
                    : handlePasswordChange
                }
              >
                <div className="space-y-4">
                  {passwordChangeStage === "reauthenticate" ? (
                    <Input
                      autoComplete="current-password"
                      autoFocus
                      aria-label="Current password"
                      label="Current password"
                      onChange={(event) =>
                        setCurrentPassword(event.target.value)
                      }
                      placeholder="Enter your current password"
                      required
                      type="password"
                      value={currentPassword}
                    />
                  ) : (
                    <>
                      <p className="text-sm text-gray-300">
                        Identity verified. This verification expires after five
                        minutes.
                      </p>
                      <Input
                        autoComplete="new-password"
                        aria-label="New password"
                        label="New password"
                        onChange={(event) => setNewPassword(event.target.value)}
                        placeholder="Enter a new password"
                        required
                        type="password"
                        value={newPassword}
                      />
                      <Input
                        autoComplete="new-password"
                        aria-label="Confirm new password"
                        label="Confirm new password"
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        placeholder="Confirm your new password"
                        required
                        type="password"
                        value={confirmPassword}
                      />
                      <PasswordStrengthMeter password={newPassword} />
                    </>
                  )}
                  {securityError && (
                    <p className="text-sm text-red-400" role="alert">
                      {securityError}
                    </p>
                  )}
                  <div className="flex justify-end gap-3">
                    <Button
                      disabled={isSecurityActionLoading}
                      onClick={closePasswordChange}
                      variant="ghost"
                    >
                      Cancel
                    </Button>
                    <Button
                      disabled={isSecurityActionLoading}
                      loading={isSecurityActionLoading}
                      type="submit"
                    >
                      {passwordChangeStage === "reauthenticate"
                        ? "Verify identity"
                        : "Save password"}
                    </Button>
                  </div>
                </div>
              </form>
            </section>
          </div>
        )}
      </div>
    </ChatLayout>
  );
}
