import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import {
  hashOtpCode,
  isOtpExpired,
  normalizeIranPhoneNumber,
} from "@/lib/phone-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, code } = body as {
      phoneNumber?: string;
      code?: string;
    };

    if (!phoneNumber || !code) {
      return NextResponse.json(
        { ok: false, error: "Phone number and code are required" },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizeIranPhoneNumber(phoneNumber);

    const otp = await prisma.otpCode.findFirst({
      where: {
        phoneNumber: normalizedPhone,
        consumedAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!otp) {
      return NextResponse.json(
        { ok: false, error: "Verification code not found" },
        { status: 400 }
      );
    }

    if (isOtpExpired(otp.expiresAt)) {
      return NextResponse.json(
        { ok: false, error: "Verification code expired" },
        { status: 400 }
      );
    }

    if (otp.attemptCount >= 5) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts" },
        { status: 400 }
      );
    }

    const incomingHash = hashOtpCode(code);

    if (incomingHash !== otp.codeHash) {
      await prisma.otpCode.update({
        where: { id: otp.id },
        data: {
          attemptCount: {
            increment: 1,
          },
        },
      });

      return NextResponse.json(
        { ok: false, error: "Invalid verification code" },
        { status: 400 }
      );
    }

    let user = await prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      if (!otp.username) {
        return NextResponse.json(
          { ok: false, error: "Missing username for account creation" },
          { status: 400 }
        );
      }

      user = await prisma.user.create({
        data: {
          username: otp.username,
          phoneNumber: normalizedPhone,
          phoneVerifiedAt: new Date(),
        },
      });
    } else if (!user.phoneVerifiedAt) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          phoneVerifiedAt: new Date(),
        },
      });
    }

    await prisma.otpCode.update({
      where: { id: otp.id },
      data: {
        consumedAt: new Date(),
      },
    });

    await createSession(user.id);

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        phoneNumber: user.phoneNumber,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed";

    return NextResponse.json(
      { ok: false, error: message },
      { status: 400 }
    );
  }
}