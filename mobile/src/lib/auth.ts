import "dotenv/config";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const adapter = new PrismaPg({ connectionString });

const globalForPrisma = globalThis as {
  authPrisma?: PrismaClient;
};

const prisma =
  globalForPrisma.authPrisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.authPrisma = prisma;
}

export const SESSION_COOKIE_NAME = "online_chess_session";

const WEB_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MOBILE_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const MOBILE_EXCHANGE_TTL_MS = 1000 * 60 * 2;

const MOBILE_SESSION_PREFIX = "mobile_";
const MOBILE_EXCHANGE_PREFIX = "exchange_";

type StoredSession = {
  token: string;
  expiresAt: Date;
};

export function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createStoredSession(
  userId: string,
  ttlMs: number,
  prefix = ""
): Promise<StoredSession> {
  const token = `${prefix}${generateSessionToken()}`;
  const expiresAt = new Date(Date.now() + ttlMs);

  await prisma.session.create({
    data: {
      token,
      userId,
      expiresAt,
    },
  });

  return { token, expiresAt };
}

export async function createSession(userId: string) {
  const { token, expiresAt } = await createStoredSession(
    userId,
    WEB_SESSION_TTL_MS
  );

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return token;
}

export async function createMobileExchangeCode(userId: string) {
  return createStoredSession(
    userId,
    MOBILE_EXCHANGE_TTL_MS,
    MOBILE_EXCHANGE_PREFIX
  );
}

export async function exchangeMobileAuthCode(code: string) {
  if (!code.startsWith(MOBILE_EXCHANGE_PREFIX)) {
    return null;
  }

  const now = new Date();

  const exchange = await prisma.session.findUnique({
    where: { token: code },
    include: { user: true },
  });

  if (!exchange) {
    return null;
  }

  if (exchange.expiresAt <= now) {
    await prisma.session.deleteMany({
      where: { id: exchange.id },
    });
    return null;
  }

  // Make the code one-time-use. Only one concurrent request may consume it.
  const consumed = await prisma.session.deleteMany({
    where: {
      id: exchange.id,
      token: code,
      expiresAt: { gt: now },
    },
  });

  if (consumed.count !== 1) {
    return null;
  }

  const mobileSession = await createStoredSession(
    exchange.userId,
    MOBILE_SESSION_TTL_MS,
    MOBILE_SESSION_PREFIX
  );

  return {
    token: mobileSession.token,
    expiresAt: mobileSession.expiresAt,
    user: exchange.user,
  };
}

export async function deleteMobileSession(token: string) {
  if (!token.startsWith(MOBILE_SESSION_PREFIX)) {
    return;
  }

  await prisma.session.deleteMany({
    where: { token },
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({
      where: { token },
    });
  }

  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  });
}

async function getRequestSessionToken(): Promise<{
  token: string | null;
  source: "bearer" | "cookie" | null;
}> {
  const headerStore = await headers();
  const authorization = headerStore.get("authorization");

  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim() ?? null;

    // Only proper mobile session tokens are accepted through Authorization.
    if (!token || !token.startsWith(MOBILE_SESSION_PREFIX)) {
      return { token: null, source: "bearer" };
    }

    return { token, source: "bearer" };
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

  return {
    token,
    source: token ? "cookie" : null,
  };
}

export async function getCurrentUser() {
  const requestSession = await getRequestSessionToken();

  if (!requestSession.token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { token: requestSession.token },
    include: { user: true },
  });

  if (!session) {
    return null;
  }

  if (session.expiresAt < new Date()) {
    await prisma.session.deleteMany({
      where: { id: session.id },
    });

    if (requestSession.source === "cookie") {
      const cookieStore = await cookies();
      cookieStore.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: new Date(0),
      });
    }

    return null;
  }

  return session.user;
}
