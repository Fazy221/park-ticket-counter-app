import { View, Text, Pressable, StyleSheet } from "react-native";
import { Redirect, Tabs, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { QrCode, ListChecks, LogOut } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts } from "@/theme/typography";
import { useAuth } from "@/context/AuthContext";
import { ConnectivityBadge } from "@/components/ConnectivityBadge";
import { useDeviceConfig } from "@/hooks/useDeviceConfig";

function AppHeader() {
  const { staff, logout } = useAuth();
  const router = useRouter();
  const config = useDeviceConfig();

  return (
    <SafeAreaView edges={["top"]} style={styles.headerSafe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.counterName}>{config?.counterName ?? ""}</Text>
          <Text style={styles.staffName}>{staff?.name}</Text>
        </View>
        <View style={styles.headerRight}>
          <ConnectivityBadge />
          <Pressable
            onPress={async () => {
              await logout();
              router.replace("/login");
            }}
            style={styles.logoutButton}
            hitSlop={10}
          >
            <LogOut size={18} color={colors.slate500} />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function AppLayout() {
  const { staff, loading } = useAuth();

  if (loading) return null;
  if (!staff) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.slate400,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
      }}
    >
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => <QrCode color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="session-log"
        options={{
          title: "Session log",
          tabBarIcon: ({ color, size }) => <ListChecks color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerSafe: { backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.slate200 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  counterName: {
    fontSize: 11,
    color: colors.slate500,
    fontFamily: fonts.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  staffName: { fontSize: 16, color: colors.slate900, fontFamily: fonts.semibold, marginTop: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 14 },
  logoutButton: { padding: 4 },
});
