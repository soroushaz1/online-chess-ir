"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

  const [step, setStep] = useState<"send" | "verify">("send");
  const [username, setUsername] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSendCode(event: React.FormEvent<HTMLFormElement>) {
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
        setError(data.error ?? "Failed to send code");
        return;
      }

      setStep("verify");
      setMessage(
        data.devCode
          ? `Development code: ${data.devCode}`
          : "Verification code sent"
      );
    } catch {
      setError("Failed to send code");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyCode(event: React.FormEvent<HTMLFormElement>) {
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
        setError(data.error ?? "Verification failed");
        return;
      }

      router.push("/");
    } catch {
      setError("Verification failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full rounded-2xl border bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-bold">Phone login</h1>

        {step === "send" ? (
          <form onSubmit={handleSendCode} className="mt-4 space-y-4">
            <input
              className="w-full rounded-xl border px-4 py-3"
              placeholder="Username (only for new account)"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <input
              className="w-full rounded-xl border px-4 py-3"
              placeholder="Phone number (e.g. 0912xxxxxxx)"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
            />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-green-700">{message}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
            >
              {isSubmitting ? "Sending..." : "Send code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="mt-4 space-y-4">
            <input
              className="w-full rounded-xl border px-4 py-3"
              placeholder="Verification code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-green-700">{message}</p> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-xl bg-black px-4 py-3 text-white disabled:opacity-50"
            >
              {isSubmitting ? "Verifying..." : "Verify code"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}