"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/LanguageProvider";

export default function LanguageToggle() {
  const { language, setLanguage } = useI18n();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleChange(nextLanguage: "fa" | "en") {
    if (nextLanguage === language) return;

    setLanguage(nextLanguage);

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => handleChange("fa")}
        disabled={isPending}
        className={`rounded-lg px-3 py-1 text-sm transition ${
          language === "fa"
            ? "bg-gray-900 text-white"
            : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        FA
      </button>

      <button
        type="button"
        onClick={() => handleChange("en")}
        disabled={isPending}
        className={`rounded-lg px-3 py-1 text-sm transition ${
          language === "en"
            ? "bg-gray-900 text-white"
            : "text-gray-700 hover:bg-gray-100"
        }`}
      >
        EN
      </button>
    </div>
  );
}