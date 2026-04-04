import { cookies } from "next/headers";
import { defaultLanguage, getDirection, messages, type Language } from "@/lib/i18n";

export async function getRequestI18n() {
  const cookieStore = await cookies();
  const cookieLang = cookieStore.get("lang")?.value;

  const language: Language =
    cookieLang === "fa" || cookieLang === "en" ? cookieLang : defaultLanguage;

  return {
    language,
    dir: getDirection(language),
    t: messages[language],
  };
}