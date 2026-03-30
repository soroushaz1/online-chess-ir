import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateOtpCode,
  hashOtpCode,
  normalizeIranPhoneNumber,
} from "@/lib/phone-auth";
import { isGhasedakConfigured, sendOtpViaGhasedak } from "@/lib/ghasedak";

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

    const existingUser = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!existingUser && !username) {
      return NextResponse.json(
        { ok: false, error: "Username is required for a new account" },
        { status: 400 }
      );
    }

    if (username) {
      const takenUsername = await prisma.user.findUnique({
        where: { username },
      });

      if (takenUsername && takenUsername.phoneNumber !== normalizedPhone) {
        return NextResponse.json(
          { ok: false, error: "Username already exists" },
          { status: 400 }
        );
      }
    }

    const latestOtp = await prisma.otpCode.findFirst({
      where: {
        phoneNumber: normalizedPhone,
        consumedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (latestOtp && Date.now() - latestOtp.createdAt.getTime() < 45_000) {
      return NextResponse.json(
        { ok: false, error: "Please wait before requesting another code" },
        { status: 429 }
      );
    }

    const code = generateOtpCode();
    const codeHash = hashOtpCode(code);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 3);

    const otp = await prisma.otpCode.create({
      data: {
        phoneNumber: normalizedPhone,
        username: existingUser ? null : username ?? null,
        codeHash,
        expiresAt,
      },
    });

    try {
      if (isGhasedakConfigured()) {
        await sendOtpViaGhasedak({
          phoneNumber: normalizedPhone,
          code,
          clientReferenceId: `otp-${otp.id}`,
        });
      } else if (process.env.NODE_ENV === "production") {
        throw new Error("Ghasedak is not configured");
      }
    } catch (error) {
      await prisma.otpCode.delete({
        where: { id: otp.id },
      }).catch(() => {});

      throw error;
    }

    return NextResponse.json({
      ok: true,
      message: "Verification code sent",
      ...(process.env.AUTH_DEBUG_SHOW_OTP === "true" ? { devCode: code } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send code";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}