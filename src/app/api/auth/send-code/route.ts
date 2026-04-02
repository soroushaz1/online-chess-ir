import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateOtpCode,
  hashOtpCode,
  normalizeIranPhoneNumber,
} from "@/lib/phone-auth";

function toGhasedakMobile(normalizedPhone: string) {
  if (normalizedPhone.startsWith("+98")) {
    return `0${normalizedPhone.slice(3)}`;
  }
  return normalizedPhone;
}

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

    const apiKey = process.env.GHASEDAK_API_KEY;
    const templateName =
      process.env.GHASEDAK_TEMPLATE_NAME || "PlayOnlineChessOtp";

    if (!apiKey) {
      throw new Error("GHASEDAK_API_KEY is not set");
    }

    const ghasedakResponse = await fetch(
      "https://gateway.ghasedak.me/rest/api/v1/WebService/SendOtpWithParams",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ApiKey: apiKey,
        },
        body: JSON.stringify({
          receptors: [
            {
              mobile: toGhasedakMobile(normalizedPhone),
              clientReferenceId: `${Date.now()}`,
            },
          ],
          templateName,
          param1: code,
          isVoice: false,
          udh: false,
        }),
      }
    );

    const ghasedakData = await ghasedakResponse.json().catch(() => null);
    console.log("Ghasedak status:", ghasedakResponse.status);
    console.log("Ghasedak response:", ghasedakData);

    if (!ghasedakResponse.ok || ghasedakData?.IsSuccess === false) {
      const message =
        ghasedakData?.Message ||
        "Ghasedak failed to send verification code";

      return NextResponse.json(
        { ok: false, error: message },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Verification code sent",
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
