import { describe, expect, it } from "vitest";
import {
  LOCKOUT_MS,
  MAX_FAILED_ATTEMPTS,
  afterFailedAttempt,
  hashPassword,
  isLocked,
  passwordProblem,
  verifyPassword,
} from "./password";

describe("password hashing", () => {
  it("verifies the right password and rejects the wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("correct horse batterY", stored)).toBe(false);
  });

  it("salts — the same password hashes differently each time", async () => {
    expect(await hashPassword("same password!")).not.toBe(await hashPassword("same password!"));
  });

  it("rejects a missing or malformed stored hash", async () => {
    expect(await verifyPassword("anything at all", null)).toBe(false);
    expect(await verifyPassword("anything at all", "bcrypt$xyz")).toBe(false);
    expect(await verifyPassword("anything at all", "scrypt$1$a$b")).toBe(false);
  });
});

describe("passwordProblem", () => {
  it("requires at least 10 characters and nothing else", () => {
    expect(passwordProblem("short")).toBe("too_short");
    expect(passwordProblem("123456789")).toBe("too_short");
    expect(passwordProblem("1234567890")).toBeNull();
    expect(passwordProblem("all lowercase words")).toBeNull();
    expect(passwordProblem("x".repeat(201))).toBe("too_long");
  });
});

describe("lockout", () => {
  const now = new Date("2026-11-09T12:00:00Z");

  it("counts failures and locks on the fifth", () => {
    let count = 0;
    let lockedUntil: Date | null = null;
    for (let i = 1; i < MAX_FAILED_ATTEMPTS; i++) {
      ({ failedLoginCount: count, lockedUntil } = afterFailedAttempt(count, now));
      expect(lockedUntil).toBeNull();
    }
    ({ failedLoginCount: count, lockedUntil } = afterFailedAttempt(count, now));
    expect(lockedUntil?.getTime()).toBe(now.getTime() + LOCKOUT_MS);
    expect(count).toBe(0);
    expect(isLocked(lockedUntil, now)).toBe(true);
    expect(isLocked(lockedUntil, new Date(now.getTime() + LOCKOUT_MS + 1))).toBe(false);
  });
});
