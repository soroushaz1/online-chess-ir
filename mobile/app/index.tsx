import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { checkServer } from "../src/lib/api";

export default function SplashScreen() {
  const [status, setStatus] = useState("در حال اتصال به سرور...");

  useEffect(() => {
    let mounted = true;
    let navigationTimeout: ReturnType<typeof setTimeout> | null = null;

    async function boot() {
      const [result] = await Promise.all([
        checkServer(),
        new Promise((resolve) => setTimeout(resolve, 900)),
      ]);

      if (!mounted) return;

      if (!result.connected) {
        setStatus("سرور پاسخ نداد؛ اتصال اینترنت را بررسی کن.");
        navigationTimeout = setTimeout(() => {
          if (mounted) router.replace("/login");
        }, 700);
        return;
      }

      if (result.authenticated) {
        setStatus("حساب شما شناسایی شد");
        navigationTimeout = setTimeout(() => {
          if (mounted) router.replace("/home");
        }, 350);
        return;
      }

      setStatus("اتصال برقرار شد");
      navigationTimeout = setTimeout(() => {
        if (mounted) router.replace("/login");
      }, 350);
    }

    void boot();

    return () => {
      mounted = false;
      if (navigationTimeout) clearTimeout(navigationTimeout);
    };
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.logoCircle}>
        <Text style={styles.logo}>♞</Text>
      </View>
      <Text style={styles.title}>شطرنج آنلاین</Text>
      <Text style={styles.subtitle}>Online Chess</Text>
      <ActivityIndicator size="small" style={styles.loader} />
      <Text style={styles.status}>{status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  logoCircle: {
    width: 112,
    height: 112,
    borderRadius: 32,
    backgroundColor: "#172033",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2a3850",
    marginBottom: 22,
  },
  logo: {
    color: "#f7f3e8",
    fontSize: 72,
    lineHeight: 84,
  },
  title: {
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: "800",
    writingDirection: "rtl",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 15,
    marginTop: 6,
  },
  loader: {
    marginTop: 34,
  },
  status: {
    color: "#94a3b8",
    marginTop: 12,
    fontSize: 13,
    textAlign: "center",
    writingDirection: "rtl",
  },
});
