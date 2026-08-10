import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL, APP_AUTH_REDIRECT_URI } from "./config";
import { exchangeMobileAuthCode } from "./api";

export type GoogleSignInResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      cancelled?: boolean;
      error: string;
    };

export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const startUrl = `${API_BASE_URL}/api/mobile/auth/google`;

  const result = await WebBrowser.openAuthSessionAsync(
    startUrl,
    APP_AUTH_REDIRECT_URI
  );

  if (result.type === "cancel" || result.type === "dismiss") {
    return {
      ok: false,
      cancelled: true,
      error: "ورود لغو شد.",
    };
  }

  if (result.type !== "success" || !("url" in result) || !result.url) {
    return {
      ok: false,
      error: "پاسخ ورود از مرورگر دریافت نشد.",
    };
  }

  const callbackUrl = new URL(result.url);
  const oauthError = callbackUrl.searchParams.get("error");

  if (oauthError) {
    return {
      ok: false,
      error: "ورود با Google ناموفق بود.",
    };
  }

  const exchangeCode = callbackUrl.searchParams.get("code");

  if (!exchangeCode) {
    return {
      ok: false,
      error: "کد ورود از سرور دریافت نشد.",
    };
  }

  await exchangeMobileAuthCode(exchangeCode);

  return { ok: true };
}
