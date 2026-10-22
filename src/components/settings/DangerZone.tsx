"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export function DangerZone({
  email,
  onDelete,
  disabled = false,
}: {
  email: string;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const canDelete =
    !disabled && confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  return (
    <div className="rounded-lg border border-red-800/60 p-4 space-y-3">
      <h4 className="text-red-400 font-medium">Danger zone</h4>
      <p className="text-sm text-gray-400">
        On-chain history cannot be deleted. This removes your account, local
        conversations, and drafts.
      </p>
      <Input
        label="Type your email to confirm deletion"
        value={confirmEmail}
        onChange={(event) => setConfirmEmail(event.target.value)}
        placeholder={email}
      />
      <Button
        variant="ghost"
        className="w-full justify-start text-red-600 hover:text-red-700"
        disabled={!canDelete}
        onClick={onDelete}
      >
        Delete Account
      </Button>
    </div>
  );
}
