import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateOtpCode,
  hashOtpCode,
  normalizeIranPhoneNumber,
} from "@/lib/phone-auth";

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
        {
          ok: false,
          error: "Username is required for a new account",
        },
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

    const code = generateOtpCode();
    const codeHash = hashOtpCode(code);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 3);

    await prisma.otpCode.create({
      data: {
        phoneNumber: normalizedPhone,
        username: existingUser ? null : username ?? null,
        codeHash,
        expiresAt,
      },
    });

    // TODO: Replace this with your real SMS provider call.
    // For development, return the code in the response.
    return NextResponse.json({
      ok: true,
      message: "Verification code sent",
      ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}),
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