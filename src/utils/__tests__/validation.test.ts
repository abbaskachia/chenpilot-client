
import { describe, it, expect } from "vitest";
import {
  emailSchema,
  passwordSchema,
  nameSchema,
  stellarAddressSchema,
  tokenAmountSchema,
  createContactSchema,
  sendPaymentSchema,
  sanitizePaymentInput,
  validateSendPayment,
  getAssetPrecision,
  getPaymentFailureMessage,
} from "../validation";

// #141 — table-driven tests for validation schemas.

describe("emailSchema", () => {
  const valid = ["user@example.com", "a.b@c.d.com", "x@y.io"];
  const invalid = [
    "",
    "no-at-sign",
    "no-domain@",
    "@no-local.com",
    "two@@at.com",
  ];

  for (const e of valid) {
    it(`accepts "${e}"`, () => {
      expect(emailSchema.safeParse(e).success).toBe(true);
    });
  }

  for (const e of invalid) {
    it(`rejects "${e}"`, () => {
      expect(emailSchema.safeParse(e).success).toBe(false);
    });
  }

  it("reports 'Email is required' on empty", () => {
    expect(emailSchema.safeParse("").error?.issues[0]?.message).toBe(
      "Email is required",
    );
  });
});

describe("passwordSchema", () => {
  const valid = ["Abcdefg1", "Password1", "UPPERlower9"];
  const invalid = ["", "short", "alllowercase1", "ALLUPPER1", "NoDigitsHere"];

  for (const p of valid) {
    it(`accepts "${p}"`, () => {
      expect(passwordSchema.safeParse(p).success).toBe(true);
    });
  }

  for (const p of invalid) {
    it(`rejects "${p}"`, () => {
      expect(passwordSchema.safeParse(p).success).toBe(false);
    });
  }

  it("requires at least 8 chars", () => {
    const r = passwordSchema.safeParse("Ab1");
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toContain("at least 8");
  });

  it("requires uppercase + lowercase + digit", () => {
    expect(passwordSchema.safeParse("alllowercase").success).toBe(false);
  });
});

describe("nameSchema", () => {
  it("rejects empty", () => {
    expect(nameSchema.safeParse("").success).toBe(false);
  });

  it("rejects single char", () => {
    expect(nameSchema.safeParse("A").success).toBe(false);
  });

  it("accepts 'Alice'", () => {
    expect(nameSchema.safeParse("Alice").success).toBe(true);
  });

  it("rejects > 50 chars", () => {
    expect(nameSchema.safeParse("A".repeat(51)).success).toBe(false);
  });
});

describe("stellarAddressSchema", () => {
  const validAddr = "G" + "A".repeat(55);

  it("accepts a valid G... 56-char address", () => {
    expect(stellarAddressSchema.safeParse(validAddr).success).toBe(true);
  });

  it("rejects empty", () => {
    expect(stellarAddressSchema.safeParse("").success).toBe(false);
  });

  it("rejects lowercase g prefix", () => {
    expect(
      stellarAddressSchema.safeParse("g" + validAddr.slice(1)).success,
    ).toBe(false);
  });

  it("rejects too-short string", () => {
    expect(stellarAddressSchema.safeParse("GABC").success).toBe(false);
  });

  it("rejects address with special chars", () => {
    expect(
      stellarAddressSchema.safeParse("G" + "!" + "A".repeat(54)).success,
    ).toBe(false);
  });
});

describe("tokenAmountSchema", () => {
  it("accepts positive decimal", () => {
    expect(tokenAmountSchema.safeParse("1.5").success).toBe(true);
  });

  it("accepts integer", () => {
    expect(tokenAmountSchema.safeParse("100").success).toBe(true);
  });

  it("rejects empty", () => {
    expect(tokenAmountSchema.safeParse("").success).toBe(false);
  });

  it("rejects zero", () => {
    expect(tokenAmountSchema.safeParse("0").success).toBe(false);
  });

  it("rejects negative", () => {
    expect(tokenAmountSchema.safeParse("-1").success).toBe(false);
  });

  it("rejects non-numeric", () => {
    expect(tokenAmountSchema.safeParse("abc").success).toBe(false);
  });
});

describe("createContactSchema", () => {
  const valid = {
    name: "Alice",
    address: "G" + "A".repeat(55),
    tokenType: "XLM" as const,
  };

  it("accepts a valid contact", () => {
    expect(createContactSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing name", () => {
    expect(createContactSchema.safeParse({ ...valid, name: "" }).success).toBe(
      false,
    );
  });

  it("rejects invalid tokenType", () => {
    expect(
      createContactSchema.safeParse({ ...valid, tokenType: "DOGE" }).success,
    ).toBe(false);
  });

  it("rejects invalid address", () => {
    expect(
      createContactSchema.safeParse({ ...valid, address: "bad" }).success,
    ).toBe(false);
  });
});

describe("sendPaymentSchema memo rules", () => {
  const payment = {
    recipientAddress: "G" + "A".repeat(55),
    amount: "1",
    tokenType: "XLM" as const,
  };

  it("omits stale memo values when memo type is none", () => {
    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memo: "stale",
        memoType: "none",
      }).success,
    ).toBe(true);

    expect(
      sanitizePaymentInput({ ...payment, memo: "stale", memoType: "none" }),
    ).not.toHaveProperty("memo");
  });

  it("accepts text memo up to 28 UTF-8 bytes and rejects longer values", () => {
    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memoType: "text",
        memo: "a".repeat(28),
      }).success,
    ).toBe(true);

    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memoType: "text",
        memo: "é".repeat(15),
      }).success,
    ).toBe(false);
  });

  it("accepts numeric memo IDs within uint64 and rejects overflow or non-numeric values", () => {
    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memoType: "id",
        memo: "18446744073709551615",
      }).success,
    ).toBe(true);

    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memoType: "id",
        memo: "18446744073709551616",
      }).success,
    ).toBe(false);

    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memoType: "id",
        memo: "12x",
      }).success,
    ).toBe(false);
  });

  it("accepts exactly 32-byte hex hashes and rejects malformed hashes", () => {
    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memoType: "hash",
        memo: "a".repeat(64),
      }).success,
    ).toBe(true);

    expect(
      sendPaymentSchema.safeParse({
        ...payment,
        memoType: "hash",
        memo: "a".repeat(63),
      }).success,
    ).toBe(false);
  });

  it("requires a memo type when a memo is provided without one", () => {
    expect(
      sendPaymentSchema.safeParse({ ...payment, memo: "untyped" }).success,
    ).toBe(false);
  });
});

describe("getPaymentFailureMessage", () => {
  it("explains reserve-related rejection in plain language", () => {
    expect(
      getPaymentFailureMessage(
        new Error("Insufficient balance to maintain reserve"),
      ),
    ).toContain("Stellar's minimum account reserve");
  });
});

describe("payment precision validation", () => {
  const validAddress = "G" + "A".repeat(55);

  it("accepts XLM values within the asset precision limit", () => {
    const result = validateSendPayment({
      recipientAddress: validAddress,
      amount: "1.1234567",
      tokenType: "XLM",
    });

    expect(result.isValid).toBe(true);
  });

  it("rejects XLM values with too many fractional digits", () => {
    const result = validateSendPayment({
      recipientAddress: validAddress,
      amount: "1.12345678",
      tokenType: "XLM",
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toContain("7 decimal");
  });

  it("applies the same precision rule to issued assets like USDC", () => {
    expect(getAssetPrecision("USDC")).toBe(7);

    const result = validateSendPayment({
      recipientAddress: validAddress,
      amount: "12.34567891",
      tokenType: "USDC",
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.join(" ")).toContain("7 decimal");
  });
});

describe("payment error guidance", () => {
  it("explains the activation requirement for unfunded destination errors", () => {
    const message = getPaymentFailureMessage({
      response: {
        data: {
          message:
            "Account does not exist. Activate the destination account first.",
        },
      },
    });

    expect(message).toContain("activate");
    expect(message).toContain("minimum balance");
  });
});
