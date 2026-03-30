import crypto from "node:crypto";

export function normalizeIranPhoneNumber(input: string) {
  const trimmed = input.trim().replace(/\s|-/g, "");

  if (/^09\d{9}$/.test(trimmed)) {
    return `+98${trimmed.slice(1)}`;
  }

  if (/^989\d{9}$/.test(trimmed)) {
    return `+${trimmed}`;
  }

  if (/^\+989\d{9}$/.test(trimmed)) {
    return trimmed;
  }

  throw new Error("Phone number must be a valid Iranian mobile number");
}

export function toIranMobile09Format(input: string) {
  const normalized = normalizeIranPhoneNumber(input);
  return `0${normalized.slice(3)}`;
}

export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashOtpCode(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function isOtpExpired(expiresAt: Date) {
  return expiresAt.getTime() < Date.now();
}