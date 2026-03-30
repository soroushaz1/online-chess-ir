import { toIranMobile09Format } from "@/lib/phone-auth";

const GHASEDAK_BASE_URL = "https://gateway.ghasedak.me/rest/api/v1/WebService";

type GhasedakInput = {
  param: string;
  value: string;
};

type SendGhasedakOtpArgs = {
  phoneNumber: string;
  code: string;
  clientReferenceId: string;
};

type GhasedakResponse = {
  IsSuccess?: boolean;
  StatusCode?: number;
  Message?: string;
  Data?: unknown;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function getOtpInputs(code: string): GhasedakInput[] {
  const codeParamName = process.env.GHASEDAK_OTP_CODE_PARAM?.trim() || "Code";
  const rawStaticInputs = process.env.GHASEDAK_OTP_STATIC_INPUTS_JSON?.trim();

  const inputs: GhasedakInput[] = [
    {
      param: codeParamName,
      value: code,
    },
  ];

  if (!rawStaticInputs) {
    return inputs;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(rawStaticInputs);
  } catch {
    throw new Error("GHASEDAK_OTP_STATIC_INPUTS_JSON must be valid JSON");
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (
        !item ||
        typeof item !== "object" ||
        !("param" in item) ||
        !("value" in item) ||
        typeof item.param !== "string" ||
        typeof item.value !== "string"
      ) {
        throw new Error(
          "GHASEDAK_OTP_STATIC_INPUTS_JSON array items must have string param and value fields"
        );
      }

      inputs.push({
        param: item.param,
        value: item.value,
      });
    }

    return inputs;
  }

  if (parsed && typeof parsed === "object") {
    for (const [param, value] of Object.entries(parsed)) {
      if (typeof value !== "string") {
        throw new Error(
          "GHASEDAK_OTP_STATIC_INPUTS_JSON object values must all be strings"
        );
      }

      inputs.push({ param, value });
    }

    return inputs;
  }

  throw new Error(
    "GHASEDAK_OTP_STATIC_INPUTS_JSON must be a JSON object or array"
  );
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

  const response = await fetch(`${GHASEDAK_BASE_URL}/SendOtpSMS`, {
    method: "POST",
    headers: {
      ApiKey: apiKey,
      "Content-Type": "application/json",
      Accept: "text/plain",
    },
    body: JSON.stringify({
      receptors: [
        {
          mobile: toIranMobile09Format(phoneNumber),
          clientReferenceId,
        },
      ],
      templateName,
      inputs: getOtpInputs(code),
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

  if (!response.ok || payload?.IsSuccess === false) {
    throw new Error(payload?.Message || "Ghasedak OTP send failed");
  }

  return payload;
}