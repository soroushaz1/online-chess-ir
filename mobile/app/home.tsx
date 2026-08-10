import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  CurrentUser,
  getCurrentUser,
  logoutMobile,
} from "../src/lib/api";

const actions = [
  { icon: "⚔", title: "بازی سریع", subtitle: "Matchmaking" },
  { icon: "♟", title: "ساخت بازی", subtitle: "Create game" },
  { icon: "☷", title: "بازی‌های من", subtitle: "Game history" },
  { icon: "★", title: "رتبه‌بندی", subtitle: "Leaderboard" },
];

export default function HomeScreen() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const loadUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();

      if (!currentUser) {
        router.replace("/login");
        return;
      }

      setUser(currentUser);
    } catch (error) {
      console.error("Could not load mobile user", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      await loadUser();
      if (mounted) setLoading(false);
    }

    void boot();

    return () => {
      mounted = false;
    };
  }, [loadUser]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadUser();
    setRefreshing(false);
  }

  async function handleLogout() {
    if (loggingOut) return;

    setLoggingOut(true);

    try {
      await logoutMobile();
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading || !user) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator />
        <Text style={styles.loadingText}>در حال دریافت حساب...</Text>
      </View>
    );
  }

  const displayName = user.name?.trim() || user.username;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.header}>
        {user.avatarUrl ? (
          <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>♞</Text>
          </View>
        )}

        <View style={styles.headerText}>
          <Text style={styles.greeting}>خوش آمدی</Text>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.username}>@{user.username}</Text>
        </View>
      </View>

      <View style={styles.ratingCard}>
        <Text style={styles.ratingLabel}>RATING</Text>
        <Text style={styles.ratingValue}>{user.rating}</Text>
        <Text style={styles.ratingHint}>
          این Rating مستقیماً از همان حساب سایت دریافت شده است.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>شروع بازی</Text>

      <View style={styles.grid}>
        {actions.map((action) => (
          <Pressable key={action.title} style={styles.actionCard} disabled>
            <Text style={styles.actionIcon}>{action.icon}</Text>
            <Text style={styles.actionTitle}>{action.title}</Text>
            <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Mobile Session فعال است ✓</Text>
        <Text style={styles.infoText}>
          اپ اکنون حساب واقعی سایت را می‌شناسد. قدم بعدی اتصال Matchmaking و
          بازی‌های آنلاین به همین session است.
        </Text>
      </View>

      <Pressable
        onPress={handleLogout}
        disabled={loggingOut}
        style={({ pressed }) => [
          styles.logoutButton,
          pressed && styles.pressed,
        ]}
      >
        {loggingOut ? (
          <ActivityIndicator />
        ) : (
          <Text style={styles.logoutButtonText}>خروج از حساب</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0b1220",
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 62,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0b1220",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#94a3b8",
    marginTop: 12,
    writingDirection: "rtl",
  },
  header: {
    flexDirection: "row-reverse",
    alignItems: "center",
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#172033",
    borderWidth: 1,
    borderColor: "#2a3850",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: "#172033",
  },
  avatarText: {
    fontSize: 35,
    color: "#f7f3e8",
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    color: "#94a3b8",
    fontSize: 12,
    textAlign: "right",
    writingDirection: "rtl",
  },
  name: {
    color: "#f8fafc",
    fontSize: 21,
    fontWeight: "800",
    marginTop: 2,
    textAlign: "right",
    writingDirection: "rtl",
  },
  username: {
    color: "#64748b",
    marginTop: 3,
    fontSize: 12,
    textAlign: "right",
  },
  ratingCard: {
    marginTop: 28,
    padding: 22,
    backgroundColor: "#111a2b",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#22304a",
  },
  ratingLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
  },
  ratingValue: {
    color: "#f8fafc",
    fontSize: 44,
    fontWeight: "900",
    marginTop: 4,
  },
  ratingHint: {
    color: "#94a3b8",
    lineHeight: 21,
    fontSize: 12,
    textAlign: "right",
    writingDirection: "rtl",
  },
  sectionTitle: {
    color: "#e2e8f0",
    fontSize: 18,
    fontWeight: "800",
    marginTop: 30,
    marginBottom: 13,
    textAlign: "right",
    writingDirection: "rtl",
  },
  grid: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 12,
  },
  actionCard: {
    width: "48%",
    minHeight: 132,
    backgroundColor: "#111a2b",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#22304a",
    padding: 16,
    opacity: 0.62,
  },
  actionIcon: {
    fontSize: 26,
    color: "#f8fafc",
  },
  actionTitle: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 14,
    textAlign: "right",
    writingDirection: "rtl",
  },
  actionSubtitle: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 4,
  },
  infoCard: {
    marginTop: 26,
    backgroundColor: "#0f1d2e",
    borderColor: "#1d4f70",
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },
  infoTitle: {
    color: "#7dd3fc",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "right",
    writingDirection: "rtl",
  },
  infoText: {
    color: "#94a3b8",
    marginTop: 8,
    lineHeight: 22,
    textAlign: "right",
    writingDirection: "rtl",
  },
  logoutButton: {
    height: 48,
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#7f1d1d",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutButtonText: {
    color: "#fca5a5",
    fontWeight: "800",
    writingDirection: "rtl",
  },
  pressed: {
    opacity: 0.72,
  },
});
