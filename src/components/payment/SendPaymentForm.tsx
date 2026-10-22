"use client";

import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  sendPaymentSchema,
  validateSendPayment,
  sanitizePaymentInput,
} from "@/utils/validation";
import {
  Contact,
  PaymentStatusResult,
  PaymentSubmissionResult,
  SendPaymentRequest,
  ContactSelection,
} from "@/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { StellarNetworkBadge } from "@/components/wallet/StellarNetworkBadge";
import {
  createPaymentIdempotencyKey,
  isPaymentOutcomeUnknown,
} from "@/utils/paymentOutcome";
import ContactPicker from "./ContactPicker";
import {
  Send,
  User,
  X,
  Loader2,
  CheckCircle,
  AlertCircle,
  Copy,
  Clock3,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { calculateSpendableNativeBalance } from "@/utils/nativeBalance";
import toast from "react-hot-toast";

interface SendPaymentFormProps {
  onSubmit: (
    data: SendPaymentRequest,
    idempotencyKey: string,
  ) => Promise<PaymentSubmissionResult>;
  onCheckStatus: (idempotencyKey: string) => Promise<PaymentStatusResult>;
  contacts: Contact[];
  isLoading?: boolean;
  defaultTokenType?: "XLM" | "USDC" | "USDT" | "BTC" | "ETH" | "AQUA";
  nativeBalance?: string;
  requiredReserve?: string;
  availableBalance?: number | string;
}

export const SendPaymentForm: React.FC<SendPaymentFormProps> = ({
  onSubmit,
  onCheckStatus,
  contacts,
  isLoading = false,
  defaultTokenType = "XLM",
  nativeBalance,
  requiredReserve,
  availableBalance,
}) => {
  const [selectedContact, setSelectedContact] =
    useState<ContactSelection | null>(null);
  const [isContactPickerOpen, setIsContactPickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewPayment, setReviewPayment] = useState<SendPaymentRequest | null>(
    null,
  );
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [paymentPhase, setPaymentPhase] = useState<
    "editing" | "review" | "pending" | "completed" | "failed" | "uncertain"
  >("editing");
  const [paymentResult, setPaymentResult] =
    useState<PaymentSubmissionResult | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [statusCheckMessage, setStatusCheckMessage] = useState<string | null>(
    null,
  );
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<SendPaymentRequest>({
    resolver: zodResolver(sendPaymentSchema),
    defaultValues: {
      tokenType: defaultTokenType,
      memoType: "none",
    },
  });

  const watchedToken = watch("tokenType");
  const watchedMemoType = watch("memoType");
  const watchedAmount = watch("amount") || "";
  const recipientAddressValue = watch("recipientAddress") || "";

  const nativeBalanceValue = Number(nativeBalance);
  const requiredReserveValue = Number(requiredReserve);
  const spendableBalance =
    nativeBalance !== undefined && requiredReserve !== undefined
      ? calculateSpendableNativeBalance(nativeBalance, requiredReserve)
      : null;

  const assetPrecision =
    watchedToken === "XLM" || watchedToken === "AQUA"
      ? 7
      : watchedToken === "USDC" || watchedToken === "USDT"
        ? 7
        : watchedToken === "BTC"
          ? 8
          : 7;

  const amountStep = `0.${"0".repeat(assetPrecision - 1)}1`;
  const numericAvailableBalance = Number(availableBalance ?? 0);
  const hasInsufficientBalance =
    watchedToken === "XLM" &&
    watchedAmount !== "" &&
    !Number.isNaN(Number(watchedAmount)) &&
    Number(watchedAmount) > numericAvailableBalance &&
    Number.isFinite(numericAvailableBalance);

  const safeCopyText = async (text: string) => {
    if (!text) {
      toast.error("There is no recipient address to copy.");
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success("Recipient address copied to clipboard.");
        return;
      }
    } catch {
      // Use the fallback below.
    }

    let textarea: HTMLTextAreaElement | null = null;

    try {
      textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      if (document.execCommand("copy")) {
        toast.success("Recipient address copied to clipboard.");
      } else {
        toast.error("Unable to copy the recipient address in this browser.");
      }
    } catch {
      toast.error("Unable to copy the recipient address in this browser.");
    } finally {
      textarea?.remove();
    }
  };

  const handleContactSelect = (contact: ContactSelection) => {
    setSelectedContact(contact);
    setValue("recipientAddress", contact.address);
    setValue("tokenType", contact.tokenType);
    toast.success(`Selected ${contact.name}`);
  };

  const handleClearContact = () => {
    setSelectedContact(null);
    setValue("recipientAddress", "");
  };

  const handleFormSubmit = (data: SendPaymentRequest) => {
    const sanitizedData = sanitizePaymentInput(data);

    if (selectedContact) {
      sanitizedData.recipientContactId = selectedContact.id;
    }

    const validation = validateSendPayment(sanitizedData);

    if (!validation.isValid) {
      validation.errors.forEach((error) => toast.error(error));
      return;
    }

    setReviewPayment(sanitizedData);
    setIdempotencyKey(createPaymentIdempotencyKey());
    setPaymentError(null);
    setPaymentResult(null);
    setStatusCheckMessage(null);
    setPaymentPhase("review");
  };

  const confirmPayment = async () => {
    if (!reviewPayment || !idempotencyKey || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setPaymentError(null);

    try {
      const result = await onSubmit(reviewPayment, idempotencyKey);
      setPaymentResult(result);

      setPaymentPhase(
        result.status === "confirmed"
          ? "completed"
          : result.status === "failed"
            ? "failed"
            : "pending",
      );
    } catch (error: unknown) {
      console.error("Payment submission error:", error);

      if (isPaymentOutcomeUnknown(error)) {
        setPaymentError(
          error instanceof Error
            ? error.message
            : "Payment outcome is unknown.",
        );
        setPaymentPhase("uncertain");
      } else {
        const message =
          error instanceof Error ? error.message : "Failed to submit payment.";

        setPaymentError(message);
        setPaymentPhase("editing");
        toast.error(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const checkPaymentStatus = async () => {
    if (!idempotencyKey || isCheckingStatus) {
      return;
    }

    setIsCheckingStatus(true);
    setStatusCheckMessage(null);

    try {
      const result = await onCheckStatus(idempotencyKey);

      if (result.status === "confirmed") {
        setPaymentResult(result);
        setPaymentPhase("completed");
      } else if (result.status === "failed") {
        setPaymentResult(result);
        setPaymentPhase("failed");
      } else if (result.status === "pending" || result.status === "submitted") {
        setPaymentResult(result);
        setPaymentPhase("pending");
      } else {
        setStatusCheckMessage(
          "No final status is available yet. Check again before taking further action; do not resend the payment.",
        );
      }
    } catch {
      setStatusCheckMessage(
        "Status could not be retrieved. The payment may still have been submitted. Check again before taking further action.",
      );
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const startFreshPayment = () => {
    reset({
      tokenType: defaultTokenType,
      memoType: "none",
    });
    setSelectedContact(null);
    setReviewPayment(null);
    setIdempotencyKey(null);
    setPaymentResult(null);
    setPaymentError(null);
    setStatusCheckMessage(null);
    setPaymentPhase("editing");
  };

  if (
    paymentPhase === "pending" ||
    paymentPhase === "completed" ||
    paymentPhase === "failed" ||
    paymentPhase === "uncertain"
  ) {
    const transactionReference =
      paymentResult?.transactionHash ?? paymentResult?.transactionId;

    return (
      <Card className="space-y-5 border border-gray-700 bg-gray-950 p-6 text-white">
        <div className="flex items-start gap-3">
          {paymentPhase === "completed" ? (
            <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-400" />
          ) : paymentPhase === "pending" ? (
            <Clock3 className="mt-0.5 h-5 w-5 text-amber-300" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-300" />
          )}

          <div>
            <h2 className="text-lg font-semibold">
              {paymentPhase === "completed"
                ? "Payment confirmed"
                : paymentPhase === "failed"
                  ? "Payment failed"
                  : paymentPhase === "pending"
                    ? "Payment submitted"
                    : "Payment status unknown"}
            </h2>

            <p className="mt-1 text-sm text-gray-300">
              {paymentPhase === "completed"
                ? "The server confirmed this payment."
                : paymentPhase === "failed"
                  ? (paymentResult?.message ??
                    "The server confirmed that this payment failed.")
                  : paymentPhase === "pending"
                    ? "The server accepted this payment. Check its status for confirmation."
                    : (paymentError ??
                      "We could not determine whether the payment was submitted.")}
            </p>
          </div>
        </div>

        {reviewPayment && (
          <dl className="grid gap-3 border-y border-gray-800 py-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-gray-400">Recipient</dt>
              <dd className="break-all font-mono text-gray-100">
                {reviewPayment.recipientAddress}
              </dd>
            </div>
            <div>
              <dt className="text-gray-400">Amount</dt>
              <dd className="text-gray-100">
                {reviewPayment.amount} {reviewPayment.tokenType}
              </dd>
            </div>
          </dl>
        )}

        {transactionReference && (
          <div className="space-y-1 text-sm">
            <p className="text-gray-400">Transaction reference</p>
            <p className="break-all font-mono text-gray-100">
              {transactionReference}
            </p>
          </div>
        )}

        {(paymentPhase === "pending" || paymentPhase === "uncertain") && (
          <div className="space-y-3">
            {statusCheckMessage && (
              <p role="status" className="text-sm text-amber-200">
                {statusCheckMessage}
              </p>
            )}

            <Button
              type="button"
              onClick={checkPaymentStatus}
              disabled={isCheckingStatus}
            >
              {isCheckingStatus ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Check payment status
            </Button>
          </div>
        )}

        {(paymentPhase === "completed" || paymentPhase === "failed") && (
          <Button type="button" onClick={startFreshPayment}>
            Start a new payment
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {spendableBalance !== null && (
        <Card className="p-4" aria-label="Native XLM balance">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Total XLM</p>
              <p className="font-semibold text-white">
                {nativeBalanceValue.toLocaleString(undefined, {
                  maximumFractionDigits: 7,
                })}{" "}
                XLM
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-400">Spendable after reserve</p>
              <p className="font-semibold text-white">
                {spendableBalance.toLocaleString(undefined, {
                  maximumFractionDigits: 7,
                })}{" "}
                XLM
              </p>
            </div>
          </div>

          {requiredReserveValue > 0 && (
            <p className="mt-2 text-xs text-gray-400">
              Keep at least{" "}
              {requiredReserveValue.toLocaleString(undefined, {
                maximumFractionDigits: 7,
              })}{" "}
              XLM in your account for its minimum reserve.
            </p>
          )}
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-white">Recipient</h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsContactPickerOpen(true)}
            className="text-blue-400 hover:text-blue-300"
          >
            <User className="mr-1 h-4 w-4" />
            Select Contact
          </Button>
        </div>

        {selectedContact ? (
          <div className="flex items-center justify-between rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500 text-sm font-semibold text-white">
                {selectedContact.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-medium text-white">{selectedContact.name}</p>
                <p className="text-xs text-gray-400">
                  {selectedContact.tokenType}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearContact}
              className="text-gray-400 hover:text-white"
              aria-label="Clear selected contact"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="py-4 text-center text-sm text-gray-500">
            Select a contact or enter address manually
          </div>
        )}
      </Card>

      <Card className="p-6">
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Recipient Address
            </label>

            <div className="flex gap-2">
              <Input
                {...register("recipientAddress")}
                placeholder="GABCD1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
                className={cn(
                  "flex-1 font-mono text-sm",
                  selectedContact && "border-blue-500/30 bg-blue-500/5",
                )}
                disabled={!!selectedContact}
              />

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => safeCopyText(recipientAddressValue)}
                className="whitespace-nowrap"
                disabled={!recipientAddressValue}
              >
                <Copy className="mr-1 h-4 w-4" />
                Copy
              </Button>
            </div>

            {errors.recipientAddress && (
              <p className="mt-1 text-xs text-red-400">
                {errors.recipientAddress.message}
              </p>
            )}
          </div>

          {availableBalance !== undefined && watchedToken === "XLM" && (
            <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Available balance</span>
                <span className="font-medium text-white">
                  {Number(availableBalance).toLocaleString(undefined, {
                    maximumFractionDigits: 7,
                  })}{" "}
                  XLM
                </span>
              </div>

              {hasInsufficientBalance && (
                <p className="mt-2 flex items-center gap-2 text-xs text-amber-300">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Requested amount exceeds your available XLM balance.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Amount
            </label>

            <div className="flex space-x-2">
              <Input
                {...register("amount")}
                placeholder="0.00"
                type="number"
                step={amountStep}
                className="flex-1"
              />

              <select
                {...register("tokenType")}
                className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="XLM">XLM</option>
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
                <option value="BTC">BTC</option>
                <option value="ETH">ETH</option>
                <option value="AQUA">AQUA</option>
              </select>
            </div>

            {errors.amount && (
              <p className="mt-1 text-xs text-red-400">
                {errors.amount.message}
              </p>
            )}
            {errors.tokenType && (
              <p className="mt-1 text-xs text-red-400">
                {errors.tokenType.message}
              </p>
            )}
            {hasInsufficientBalance && !errors.amount && (
              <p className="mt-1 flex items-center gap-1 text-xs text-amber-300">
                <AlertCircle className="h-3.5 w-3.5" />
                Insufficient funds for this XLM transfer.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-300">
              Memo (Optional)
            </label>

            <div className="space-y-2">
              <select
                {...register("memoType")}
                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="none">No Memo</option>
                <option value="text">Text Memo</option>
                <option value="id">ID Memo</option>
                <option value="hash">Hash Memo</option>
              </select>

              {watchedMemoType !== "none" && (
                <Input
                  {...register("memo")}
                  placeholder={
                    watchedMemoType === "text"
                      ? "Enter memo text (max 28 UTF-8 bytes)"
                      : watchedMemoType === "id"
                        ? "Enter numeric ID"
                        : "Enter 64-character hex hash"
                  }
                  className={cn(
                    "font-mono text-sm",
                    watchedMemoType === "hash" && "uppercase",
                  )}
                  maxLength={
                    watchedMemoType === "hash"
                      ? 64
                      : watchedMemoType === "id"
                        ? 20
                        : 28
                  }
                />
              )}
            </div>

            {errors.memo && (
              <p className="mt-1 text-xs text-red-400">{errors.memo.message}</p>
            )}
            {errors.memoType && (
              <p className="mt-1 text-xs text-red-400">
                {errors.memoType.message}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting || isLoading || hasInsufficientBalance}
            className="w-full"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Review Payment
              </>
            )}
          </Button>
        </form>
      </Card>

      <ContactPicker
        contacts={contacts}
        onSelect={handleContactSelect}
        onClose={() => setIsContactPickerOpen(false)}
        isOpen={isContactPickerOpen}
        tokenType={watchedToken}
      />

      <Modal
        isOpen={paymentPhase === "review" && !!reviewPayment}
        onClose={() => {
          if (!isSubmitting) {
            setPaymentPhase("editing");
            setReviewPayment(null);
            setIdempotencyKey(null);
          }
        }}
        title="Review payment"
        className="border border-gray-700 bg-gray-950 text-white"
        titleClassName="text-white"
      >
        {reviewPayment && (
          <div className="space-y-5">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-gray-400">Recipient</dt>
                <dd className="mt-1 break-all font-mono text-gray-100">
                  {reviewPayment.recipientAddress}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-gray-400">Amount</dt>
                <dd className="text-right font-semibold text-white">
                  {reviewPayment.amount} {reviewPayment.tokenType}
                </dd>
              </div>

              <div>
                <dt className="text-gray-400">Memo</dt>
                <dd className="mt-1 break-all text-gray-100">
                  {reviewPayment.memo
                    ? `${reviewPayment.memo} (${reviewPayment.memoType ?? "text"})`
                    : "No memo"}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-gray-400">Network</dt>
                <dd>
                  <StellarNetworkBadge />
                </dd>
              </div>
            </dl>

            {paymentError && (
              <p role="alert" className="text-sm text-red-300">
                {paymentError}
              </p>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPaymentPhase("editing");
                  setReviewPayment(null);
                  setIdempotencyKey(null);
                }}
                disabled={isSubmitting}
              >
                Return to edit
              </Button>

              <Button
                type="button"
                onClick={confirmPayment}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                Confirm and send
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SendPaymentForm;
