import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { API_BASE_URL } from "../src/lib/config";
import { checkServer } from "../src/lib/api";
import { signInWithGoogle } from "../src/lib/google-auth";

export default function LoginScreen() {
  const [checking, setChecking] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [message, setMessage] = useState("برای ورود از حساب Google استفاده کن.");

  useEffect(() => {
    void WebBrowser.warmUpAsync();

    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  async function handleCheckServer() {
    setChecking(true);

    try {
      const result = await checkServer();
      setServerOnline(result.connected);
      setMessage(
        result.connected
          ? "اتصال به سرور برقرار است."
          : "اتصال برقرار نشد. اینترنت، دامنه و SSL را بررسی کن."
      );

      if (result.authenticated) {
        router.replace("/home");
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleGoogleLogin() {
    if (signingIn) return;

    setSigningIn(true);
    setMessage("در حال باز کردن ورود Google...");

    try {
      const result = await signInWithGoogle();

      if (!result.ok) {
        setMessage(result.error);
        return;
      }

      setMessage("ورود موفق بود.");
      router.replace("/home");
    } catch (error) {
      console.error("Google mobile sign-in failed", error);
      setMessage(
        error instanceof Error
          ? `ورود انجام نشد: ${error.message}`
          : "ورود انجام نشد. دوباره تلاش کن."
      );
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.top}>
        <Text style={styles.knight}>♞</Text>
        <Text style={styles.title}>ورود به شطرنج آنلاین</Text>
        <Text style={styles.description}>
          با همان حساب Google سایت وارد شو؛ بازی‌ها و Rating مشترک خواهند بود.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              serverOnline === true && styles.dotOnline,
              serverOnline === false && styles.dotOffline,
            ]}
          />
          <Text style={styles.statusText}>{message}</Text>
        </View>

        <Text style={styles.endpoint} numberOfLines={1}>
          {API_BASE_URL}
        </Text>

        <Pressable
          onPress={handleGoogleLogin}
          disabled={signingIn}
          style={({ pressed }) => [
            styles.googleButton,
            pressed && styles.pressed,
            signingIn && styles.disabled,
          ]}
        >
          {signingIn ? (
            <ActivityIndicator color="#111827" />
          ) : (
            <>
              <Text style={styles.googleMark}>G</Text>
              <Text style={styles.googleButtonText}>ورود با Google</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.note}>
          ورود در مرورگر امن انجام می‌شود و رمز Google وارد اپ یا سرور ما نمی‌شود.
          بعد از تأیید، یک session مخصوص موبایل روی این دستگاه ذخیره می‌شود.
        </Text>

        <Pressable
          onPress={handleCheckServer}
          disabled={checking}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && styles.pressed,
          ]}
        >
          {checking ? (
            <ActivityIndicator />
          ) : (
            <Text style={styles.secondaryButtonText}>تست اتصال به سرور</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    paddingHorizontal: 22,
    paddingTop: 72,
    paddingBottom: 28,
  },
  top: {
    alignItems: "center",
  },
  knight: {
    fontSize: 58,
    color: "#f7f3e8",
  },
  title: {
    color: "#f8fafc",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 14,
    writingDirection: "rtl",
  },
  description: {
    color: "#94a3b8",
    textAlign: "center",
    fontSize: 14,
    lineHeight: 23,
    marginTop: 10,
    writingDirection: "rtl",
  },
  card: {
    marginTop: 40,
    backgroundColor: "#111a2b",
    borderColor: "#22304a",
    borderWidth: 1,
    borderRadius: 24,
    padding: 18,
  },
  statusRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#64748b",
    marginLeft: 9,
  },
  dotOnline: {
    backgroundColor: "#22c55e",
  },
  dotOffline: {
    backgroundColor: "#ef4444",
  },
  statusText: {
    flex: 1,
    color: "#cbd5e1",
    fontSize: 13,
    textAlign: "right",
    writingDirection: "rtl",
  },
  endpoint: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 12,
    textAlign: "center",
  },
  googleButton: {
    height: 54,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginTop: 20,
  },
  googleMark: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "900",
  },
  googleButtonText: {
    color: "#111827",
    fontWeight: "800",
    fontSize: 15,
  },
  note: {
    color: "#64748b",
    fontSize: 12,
    lineHeight: 20,
    marginTop: 14,
    textAlign: "right",
    writingDirection: "rtl",
  },
  secondaryButton: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontWeight: "700",
    writingDirection: "rtl",
  },
  pressed: {
    opacity: 0.72,
  },
  disabled: {
    opacity: 0.65,
  },
});
