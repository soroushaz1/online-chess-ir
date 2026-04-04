"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LanguageProvider";

type SendCodeResponse = {
  ok: boolean;
  error?: string;
  devCode?: string;
};

type VerifyCodeResponse = {
  ok: boolean;
  error?: string;
};

export default function PhoneAuthPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [step, setStep] = useState<"send" | "verify">("send");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function translateAuthError(serverError?: string) {
    switch (serverError) {
      case "Phone number is required":
        return t.authPhone.phoneRequired;
      case "Username is required for a new account":
        return t.authPhone.usernameRequired;
      case "Username already exists":
        return t.authPhone.usernameExists;
      case "Phone number and code are required":
        return t.authPhone.phoneAndCodeRequired;
      case "Verification code not found":
        return t.authPhone.codeNotFound;
      case "Verification code expired":
        return t.authPhone.codeExpired;
      case "Too many attempts":
        return t.authPhone.tooManyAttempts;
      case "Invalid verification code":
        return t.authPhone.invalidCode;
      case "Missing username for account creation":
        return t.authPhone.missingUsername;
      case "Failed to send code":
        return t.authPhone.sendFailed;
      case "Verification failed":
        return t.authPhone.verifyFailed;
      default:
        return serverError;
    }
  }

  async function handleSendCode(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username || undefined,
          phoneNumber,
        }),
      });

      const data: SendCodeResponse = await response.json();

      if (!response.ok || !data.ok) {
        setError(translateAuthError(data.error) ?? t.authPhone.sendFailed);
        return;
      }

      setStep("verify");
      setMessage(
        data.devCode
          ? `${t.authPhone.devCodePrefix}: ${data.devCode}`
          : t.authPhone.codeSent
      );
    } catch {
      setError(t.authPhone.sendFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phoneNumber,
          code,
        }),
      });

      const data: VerifyCodeResponse = await response.json();

      if (!response.ok || !data.ok) {
        setError(translateAuthError(data.error) ?? t.authPhone.verifyFailed);
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError(t.authPhone.verifyFailed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <h1 className="text-2xl font-bold text-gray-900">{t.authPhone.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{t.authPhone.subtitle}</p>

        {step === "send" ? (
          <form onSubmit={handleSendCode} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.authPhone.usernameLabel}
              </label>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder={t.authPhone.usernamePlaceholder}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.authPhone.phoneLabel}
              </label>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder={t.authPhone.phonePlaceholder}
                inputMode="tel"
                dir="ltr"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
              />
            </div>

            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gray-900 px-4 py-3 font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? t.authPhone.sending : t.authPhone.sendCode}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.authPhone.phoneLabel}
              </label>
              <input
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder={t.authPhone.phonePlaceholder}
                inputMode="tel"
                dir="ltr"
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t.authPhone.codeLabel}
              </label>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={t.authPhone.codePlaceholder}
                inputMode="numeric"
                dir="ltr"
                className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
              />
            </div>

            {error ? (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {message ? (
              <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-gray-900 px-4 py-3 font-medium text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? t.authPhone.verifying : t.authPhone.verifyCode}
            </button>
          </form>
        )}

        <div className="mt-6">
          <Link href="/" className="text-sm text-gray-600 hover:text-gray-900">
            {t.common.backToHome}
          </Link>
        </div>
      </div>
    </main>
  );
}