import { toIranMobile09Format } from "@/lib/phone-auth";

const GHASEDAK_BASE_URL = "https://gateway.ghasedak.me/rest/api/v1/WebService";

type SendGhasedakOtpArgs = {
  phoneNumber: string;
  code: string;
  clientReferenceId: string;
};

type GhasedakResponse = {
  isSuccess?: boolean;
  IsSuccess?: boolean;
  statusCode?: number;
  StatusCode?: number;
  message?: string;
  Message?: string;
  data?: unknown;
  Data?: unknown;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function isGhasedakConfigured() {
  return Boolean(
    process.env.GHASEDAK_API_KEY?.trim() &&
      process.env.GHASEDAK_OTP_TEMPLATE_NAME?.trim()
  );
}

export async function sendOtpViaGhasedak({
  phoneNumber,
  code,
  clientReferenceId,
}: SendGhasedakOtpArgs) {
  const apiKey = getRequiredEnv("GHASEDAK_API_KEY");
  const templateName = getRequiredEnv("GHASEDAK_OTP_TEMPLATE_NAME");
  const codeParamName = process.env.GHASEDAK_OTP_CODE_PARAM?.trim() || "Code";

  const response = await fetch(`${GHASEDAK_BASE_URL}/SendOtpSMS`, {
    method: "POST",
    headers: {
      ApiKey: apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      receptors: [
        {
          mobile: toIranMobile09Format(phoneNumber),
          clientReferenceId,
        },
      ],
      templateName,
      inputs: [
        {
          param: codeParamName,
          value: code,
        },
      ],
      udh: false,
    }),
    cache: "no-store",
  });

  let payload: GhasedakResponse | null = null;

  try {
    payload = (await response.json()) as GhasedakResponse;
  } catch {
    payload = null;
  }

  const isSuccess = payload?.isSuccess ?? payload?.IsSuccess;
  const message = payload?.message ?? payload?.Message;

  if (!response.ok || isSuccess === false) {
    throw new Error(message || "Ghasedak OTP send failed");
  }

  return payload;
}