import { API_BASE_URL } from "./config";
import {
  clearMobileSessionToken,
  getMobileSessionToken,
  setMobileSessionToken,
} from "./session";

export type CurrentUser = {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  rating: number;
};

type MeResponse = {
  ok: boolean;
  user: CurrentUser | null;
};

type ExchangeResponse =
  | {
      ok: true;
      sessionToken: string;
      expiresAt: string;
      user: CurrentUser;
    }
  | {
      ok: false;
      error?: string;
    };

export type ServerCheckResult = {
  connected: boolean;
  authenticated: boolean;
  user: CurrentUser | null;
  message: string;
};

async function fetchWithMobileSession(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = await getMobileSessionToken();
  const requestHeaders = new Headers(init.headers);

  if (!requestHeaders.has("Accept")) {
    requestHeaders.set("Accept", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: requestHeaders,
  });
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetchWithMobileSession("/api/auth/me", {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Server returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as MeResponse;

  if (!data.ok) {
    throw new Error("Unexpected API response");
  }

  return data.user;
}

export async function checkServer(): Promise<ServerCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const existingToken = await getMobileSessionToken();

  try {
    const tokenHeaders: Record<string, string> = {
      Accept: "application/json",
    };

    if (existingToken) {
      tokenHeaders.Authorization = `Bearer ${existingToken}`;
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: tokenHeaders,
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        connected: false,
        authenticated: false,
        user: null,
        message: `Server returned HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as MeResponse;

    if (!data.ok) {
      return {
        connected: false,
        authenticated: false,
        user: null,
        message: "Unexpected API response",
      };
    }

    if (existingToken && !data.user) {
      await clearMobileSessionToken();
    }

    return {
      connected: true,
      authenticated: Boolean(data.user),
      user: data.user,
      message: data.user
        ? `Connected as ${data.user.username}`
        : "Server is reachable",
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Connection timed out"
        : "Could not reach the server";

    return {
      connected: false,
      authenticated: false,
      user: null,
      message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeMobileAuthCode(code: string) {
  const response = await fetch(`${API_BASE_URL}/api/mobile/auth/exchange`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code }),
  });

  const data = (await response.json()) as ExchangeResponse;

  if (!response.ok || !data.ok) {
    throw new Error(
      "error" in data && data.error
        ? data.error
        : `Session exchange failed (${response.status})`
    );
  }

  await setMobileSessionToken(data.sessionToken);

  return {
    user: data.user,
    expiresAt: data.expiresAt,
  };
}

export async function logoutMobile() {
  const token = await getMobileSessionToken();

  try {
    if (token) {
      await fetch(`${API_BASE_URL}/api/mobile/auth/logout`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } finally {
    await clearMobileSessionToken();
  }
}