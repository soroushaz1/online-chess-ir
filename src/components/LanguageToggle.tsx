"use client";

import { useI18n } from "@/components/LanguageProvider";

export default function LanguageToggle() {
  const { language, setLanguage } = useI18n();

  return (
    <div className="inline-flex items-center gap-1 rounded-xl border bg-white p-1 shadow-sm">
      <button
        type="button"
        onClick={() => setLanguage("fa")}
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
        onClick={() => setLanguage("en")}
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