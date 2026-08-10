import { API_BASE_URL } from "./config";

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

export type ServerCheckResult = {
  connected: boolean;
  authenticated: boolean;
  user: CurrentUser | null;
  message: string;
};

export async function checkServer(): Promise<ServerCheckResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
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
