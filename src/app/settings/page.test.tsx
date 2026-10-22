import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import SettingsPage from "./page";
import apiService from "@/services/api";
import authService from "@/services/auth.service";
import toast from "react-hot-toast";

const mockAuth = vi.hoisted(() => ({ authProvider: "email" }));

vi.mock("@/store", () => ({
  useAppDispatch: () => vi.fn(),
  useAppSelector: (
    selector: (state: {
      auth: {
        isAuthenticated: boolean;
        user: { name: string; email: string; authProvider: string };
        isLoading: boolean;
      };
      ui: { theme: { mode: string }; language: "en" };
    }) => unknown,
  ) =>
    selector({
      auth: {
        isAuthenticated: true,
        user: {
          name: "Test User",
          email: "test@example.com",
          authProvider: mockAuth.authProvider,
        },
        isLoading: false,
      },
      ui: { theme: { mode: "dark" }, language: "en" },
    }),
}));

vi.mock("@/store/slices/authSlice", () => ({
  fetchProfile: vi.fn(),
}));

vi.mock("@/store/slices/uiSlice", () => ({
  setLanguage: vi.fn(),
}));

vi.mock("@/components/layout/ChatLayout", () => ({
  ChatLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/settings/MfaSettingsSection", () => ({
  MfaSettingsSection: () => null,
}));

vi.mock("@/components/settings/DangerZone", () => ({
  DangerZone: () => null,
}));

vi.mock("@/components/wallet/StellarNetworkBadge", () => ({
  StellarNetworkBadge: () => null,
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn() },
}));

describe("SettingsPage password re-authentication", () => {
  beforeEach(() => {
    mockAuth.authProvider = "email";
    authService.clearRecentAuthentication();
  });

  afterEach(() => {
    cleanup();
    authService.clearRecentAuthentication();
    vi.restoreAllMocks();
  });

  it("clears the re-authentication grant when the user cancels", async () => {
    const reauthenticate = vi
      .spyOn(apiService, "reauthenticate")
      .mockResolvedValue();
    const changePassword = vi.spyOn(apiService, "changePassword");
    const clearGate = vi.spyOn(authService, "clearRecentAuthentication");
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    fireEvent.change(
      screen.getByPlaceholderText("Enter your current password"),
      { target: { value: "current-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify identity" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save password" }),
      ).toBeInTheDocument();
    });
    expect(authService.hasRecentAuthentication()).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(reauthenticate).toHaveBeenCalledOnce();
    expect(changePassword).not.toHaveBeenCalled();
    expect(clearGate).toHaveBeenCalled();
    expect(authService.hasRecentAuthentication()).toBe(false);
  });

  it("keeps the password-change action blocked when re-authentication is denied", async () => {
    vi.spyOn(apiService, "reauthenticate").mockRejectedValue(
      new Error("Invalid credentials"),
    );
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    fireEvent.change(
      screen.getByPlaceholderText("Enter your current password"),
      { target: { value: "wrong-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify identity" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Invalid credentials",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Verify your identity");
    expect(screen.queryByRole("button", { name: "Save password" })).toBeNull();
  });

  it("blocks a password that does not meet the shared password schema", async () => {
    vi.spyOn(apiService, "reauthenticate").mockResolvedValue();
    const changePassword = vi.spyOn(apiService, "changePassword");
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    fireEvent.change(
      screen.getByPlaceholderText("Enter your current password"),
      { target: { value: "current-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify identity" }));
    await screen.findByRole("button", { name: "Save password" });
    fireEvent.change(screen.getByPlaceholderText("Enter a new password"), {
      target: { value: "weak-password" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: "weak-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Password must contain at least one uppercase letter, one lowercase letter, and one number",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("requires the new password and confirmation to match", async () => {
    vi.spyOn(apiService, "reauthenticate").mockResolvedValue();
    const changePassword = vi.spyOn(apiService, "changePassword");
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    fireEvent.change(
      screen.getByPlaceholderText("Enter your current password"),
      { target: { value: "current-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify identity" }));
    await screen.findByRole("button", { name: "Save password" });
    fireEvent.change(screen.getByPlaceholderText("Enter a new password"), {
      target: { value: "NewPassword1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: "DifferentPassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Passwords don't match",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("does not offer password changes for Google-only accounts", () => {
    mockAuth.authProvider = "google";
    render(<SettingsPage />);

    expect(screen.getByRole("button", { name: "Change Password" })).toBeDisabled();
    expect(screen.getByText(/unavailable for Google sign-in accounts/i)).toBeInTheDocument();
  });

  it("allows the protected form only after successful re-authentication", async () => {
    vi.spyOn(apiService, "reauthenticate").mockResolvedValue();
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    fireEvent.change(
      screen.getByPlaceholderText("Enter your current password"),
      { target: { value: "current-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify identity" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save password" }),
      ).toBeInTheDocument();
    });
    expect(authService.hasRecentAuthentication()).toBe(true);
  });

  it("submits the password change only while the grant is valid", async () => {
    vi.spyOn(apiService, "reauthenticate").mockResolvedValue();
    const changePassword = vi
      .spyOn(apiService, "changePassword")
      .mockResolvedValue({
        success: true,
        data: { message: "Password changed" },
      });
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: "Change Password" }));
    fireEvent.change(
      screen.getByPlaceholderText("Enter your current password"),
      { target: { value: "current-password" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Verify identity" }));
    await screen.findByRole("button", { name: "Save password" });
    fireEvent.change(screen.getByPlaceholderText("Enter a new password"), {
      target: { value: "NewPassword1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm your new password"), {
      target: { value: "NewPassword1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith(
        "current-password",
        "NewPassword1",
      );
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Password changed successfully");
    expect(authService.hasRecentAuthentication()).toBe(false);
  });
});
