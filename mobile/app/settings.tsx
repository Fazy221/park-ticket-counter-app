import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, ServerCog, Trash2 } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts, type } from "@/theme/typography";
import { useDeviceConfig } from "@/hooks/useDeviceConfig";
import { clearDeviceConfig } from "@/lib/deviceConfig";
import { forgetAllStaffTokens } from "@/lib/authTokenCache";
import { getPendingCount } from "@/lib/queue";
import { stopAutoSync } from "@/lib/queue";
import { stopConnectivityMonitor } from "@/lib/connectivity";

export default function Settings() {
  const router = useRouter();
  const config = useDeviceConfig();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    getPendingCount().then(setPendingCount);
  }, []);

  const changeServer = () => {
    Alert.alert(
      "Change server or counter",
      "This device will need to be set up again before anyone can scan.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: async () => {
            await clearDeviceConfig();
            stopAutoSync();
            stopConnectivityMonitor();
            router.replace("/setup");
          },
        },
      ]
    );
  };

  const forgetDevice = () => {
    const warning =
      pendingCount > 0
        ? `This device has ${pendingCount} scan${pendingCount === 1 ? "" : "s"} not yet synced to the server. Forgetting this device will make it impossible to sync them, because it erases every staff member's saved login. This cannot be undone.`
        : "This erases every staff member's saved login and this device's server/counter setup. This cannot be undone.";
    Alert.alert("Forget this device?", warning, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Forget device",
        style: "destructive",
        onPress: async () => {
          await forgetAllStaffTokens();
          await clearDeviceConfig();
          stopAutoSync();
          stopConnectivityMonitor();
          router.replace("/setup");
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
        <ChevronLeft size={22} color={colors.slate700} />
        <Text style={styles.backText}>Back</Text>
      </Pressable>

      <Text style={styles.title}>Device settings</Text>

      {config ? (
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>Server</Text>
          <Text style={styles.infoValue}>{config.serverUrl}</Text>
          <Text style={[styles.infoLabel, { marginTop: 12 }]}>Counter</Text>
          <Text style={styles.infoValue}>{config.counterName}</Text>
        </View>
      ) : null}

      {pendingCount > 0 ? (
        <Text style={styles.pendingWarning}>
          {pendingCount} scan{pendingCount === 1 ? "" : "s"} still waiting to sync.
        </Text>
      ) : null}

      <Pressable style={styles.row} onPress={changeServer}>
        <ServerCog size={20} color={colors.slate700} />
        <Text style={styles.rowText}>Change server or counter</Text>
      </Pressable>

      <Pressable style={styles.row} onPress={forgetDevice}>
        <Trash2 size={20} color={colors.danger} />
        <Text style={[styles.rowText, { color: colors.danger }]}>Forget this device</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, padding: 16 },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { color: colors.slate700, fontFamily: fonts.medium, fontSize: 15 },
  title: { ...type.h2, fontFamily: fonts.bold, color: colors.slate900, marginTop: 16 },
  infoBlock: {
    marginTop: 20,
    backgroundColor: colors.slate50,
    borderRadius: 12,
    padding: 16,
  },
  infoLabel: {
    fontSize: 11,
    color: colors.slate500,
    fontFamily: fonts.medium,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoValue: { fontSize: 15, color: colors.slate900, fontFamily: fonts.medium, marginTop: 2 },
  pendingWarning: {
    marginTop: 16,
    color: colors.pending,
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 16,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.slate100,
  },
  rowText: { fontSize: 16, color: colors.slate800, fontFamily: fonts.medium },
});
