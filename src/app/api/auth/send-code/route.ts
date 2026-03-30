import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isGhasedakConfigured, sendOtpViaGhasedak } from "@/lib/ghasedak";
import {
  generateOtpCode,
  hashOtpCode,
  normalizeIranPhoneNumber,
} from "@/lib/phone-auth";

const OTP_TTL_MS = 1000 * 60 * 3;
const OTP_RESEND_COOLDOWN_MS = 1000 * 45;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, phoneNumber } = body as {
      username?: string;
      phoneNumber?: string;
    };

    if (!phoneNumber) {
      return NextResponse.json(
        { ok: false, error: "Phone number is required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizeIranPhoneNumber(phoneNumber);
    const cleanedUsername = username?.trim();

    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!existingUser && !cleanedUsername) {
      return NextResponse.json(
        {
          ok: false,
          error: "Username is required for a new account",
        },
        { status: 400 }
      );
    }

    if (cleanedUsername) {
      const takenUsername = await prisma.user.findUnique({
        where: { username: cleanedUsername },
      });

      if (takenUsername && takenUsername.phoneNumber !== normalizedPhone) {
        return NextResponse.json(
          { ok: false, error: "Username already exists" },
          { status: 400 }
        );
      }
    }

    const recentOtp = await prisma.otpCode.findFirst({
      where: {
        phoneNumber: normalizedPhone,
        consumedAt: null,
        createdAt: {
          gte: new Date(Date.now() - OTP_RESEND_COOLDOWN_MS),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (recentOtp) {
      return NextResponse.json(
        {
          ok: false,
          error: "Please wait a little before requesting another code",
        },
        { status: 429 }
      );
    }

    const code = generateOtpCode();
    const codeHash = hashOtpCode(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    const clientReferenceId = crypto.randomUUID();
    const shouldUseDebugCode = process.env.AUTH_DEBUG_SHOW_OTP === "true";

    if (isGhasedakConfigured()) {
      await sendOtpViaGhasedak({
        phoneNumber: normalizedPhone,
        code,
        clientReferenceId,
      });
    } else if (process.env.NODE_ENV === "production") {
      throw new Error("Ghasedak is not configured");
    }

    await prisma.$transaction([
      prisma.otpCode.updateMany({
        where: {
          phoneNumber: normalizedPhone,
          consumedAt: null,
        },
        data: {
          consumedAt: new Date(),
        },
      }),
      prisma.otpCode.create({
        data: {
          phoneNumber: normalizedPhone,
          username: existingUser ? null : cleanedUsername ?? null,
          codeHash,
          expiresAt,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message: "Verification code sent",
      ...(shouldUseDebugCode ? { devCode: code } : {}),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send code";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    );
  }
}
