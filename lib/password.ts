// Pure password hashing — node:crypto scrypt, no extra dependency. Server-only
// in practice; not importing "server-only" so tests and scripts can use it.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";

function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Decided Nov 2026: at least 10 characters, no other composition rules. */
export const PASSWORD_MIN_LENGTH = 10;
/** Upper bound so a megabyte "password" can't be used to burn CPU. */
export const PASSWORD_MAX_LENGTH = 200;

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export type PasswordProblem = "too_short" | "too_long" | null;

export function passwordProblem(password: string): PasswordProblem {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  if (password.length > PASSWORD_MAX_LENGTH) return "too_long";
  return null;
}

/** Returns "scrypt$<N>$<salt b64>$<hash b64>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return ["scrypt", String(PARAMS.N), salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, nRaw, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !nRaw || !saltB64 || !hashB64) return false;
  const N = Number.parseInt(nRaw, 10);
  if (!Number.isInteger(N) || N < 1024 || N > 1 << 20) return false;
  if (password.length > PASSWORD_MAX_LENGTH) return false;
  const expected = Buffer.from(hashB64, "base64");
  if (expected.length === 0) return false;
  const actual = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(saltB64, "base64"),
    expected.length,
    { ...PARAMS, N },
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// --- Failed-attempt lockout (pure) -------------------------------------------

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

/** After a failed attempt: the new count, and a lock time once the limit is hit. */
export function afterFailedAttempt(
  failedCount: number,
  now: Date,
): { failedLoginCount: number; lockedUntil: Date | null } {
  const next = failedCount + 1;
  if (next >= MAX_FAILED_ATTEMPTS) {
    return { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) };
  }
  return { failedLoginCount: next, lockedUntil: null };
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil != null && lockedUntil.getTime() > now.getTime();
}
