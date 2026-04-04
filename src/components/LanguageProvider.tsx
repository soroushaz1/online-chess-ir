"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { defaultLanguage, getDirection, messages, type Language } from "@/lib/i18n";

type Messages = typeof messages;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  dir: "rtl" | "ltr";
  t: Messages[Language];
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "online-chess-language";
const COOKIE_KEY = "lang";
const LANGUAGE_CHANGE_EVENT = "online-chess-language-change";

function readLanguageFromCookie(): Language | null {
  if (typeof document === "undefined") {
    return null;
  }

  const cookieValue = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${COOKIE_KEY}=`))
    ?.split("=")[1];

  if (cookieValue === "fa" || cookieValue === "en") {
    return cookieValue;
  }

  return null;
}

function readStoredLanguage(): Language {
  if (typeof window === "undefined") {
    return defaultLanguage;
  }

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "fa" || saved === "en") {
      return saved;
    }
  } catch {}

  return readLanguageFromCookie() ?? defaultLanguage;
}

function subscribeToLanguageChange(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleChange = () => {
    onStoreChange();
  };

  window.addEventListener("storage", handleChange);
  window.addEventListener(LANGUAGE_CHANGE_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleChange);
  };
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(
    subscribeToLanguageChange,
    readStoredLanguage,
    () => defaultLanguage
  );

  const setLanguage = useCallback((nextLanguage: Language) => {
    if (typeof window === "undefined") return;

    try {
      window.localStorage.setItem(STORAGE_KEY, nextLanguage);
    } catch {}

    document.cookie = `${COOKIE_KEY}=${nextLanguage}; path=/; max-age=31536000; samesite=lax`;
    window.dispatchEvent(new Event(LANGUAGE_CHANGE_EVENT));
  }, []);

  useEffect(() => {
    const dir = getDirection(language);
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    document.body.dir = dir;
    document.cookie = `${COOKIE_KEY}=${language}; path=/; max-age=31536000; samesite=lax`;
  }, [language]);

  const value = useMemo<I18nContextValue>(() => {
    return {
      language,
      setLanguage,
      dir: getDirection(language),
      t: messages[language],
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used inside LanguageProvider");
  }

  return context;
}