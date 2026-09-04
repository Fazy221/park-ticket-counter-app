import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronLeft, Settings } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts, type } from "@/theme/typography";
import { StaffPicker } from "@/components/StaffPicker";
import { PinPad } from "@/components/PinPad";
import { ConnectivityBadge } from "@/components/ConnectivityBadge";
import { fetchStaffNames, StaffLite } from "@/lib/api";
import { getDeviceConfig, DeviceConfig } from "@/lib/deviceConfig";
import { useServerUrl } from "@/hooks/useServerUrl";
import { useAuth } from "@/context/AuthContext";

export default function Login() {
  const router = useRouter();
  const { login } = useAuth();
  const serverUrl = useServerUrl();

  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [selected, setSelected] = useState<StaffLite | null>(null);
  const [pin, setPin] = useState("");
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const loadStaff = useCallback(async (serverUrl: string) => {
    setLoadingStaff(true);
    setLoadError(null);
    try {
      const list = await fetchStaffNames(serverUrl);
      setStaff(list);
    } catch {
      setLoadError("Can't reach the server. Logging in needs a connection - once you're in, scanning keeps working offline.");
    } finally {
      setLoadingStaff(false);
    }
  }, []);

  useEffect(() => {
    getDeviceConfig().then(setConfig);
  }, []);

  // Uses the live, self-healing address (useServerUrl) rather than
  // config.serverUrl, which is a one-time read from setup and won't
  // reflect a mid-session rediscovery (README "Deployment hardening" item
  // 1) - relevant here specifically because this is the screen staff hit
  // right after a device reconnects.
  useEffect(() => {
    if (serverUrl) loadStaff(serverUrl);
  }, [serverUrl, loadStaff]);

  const submitPin = async () => {
    if (!serverUrl || !selected) return;
    setSubmitting(true);
    setPinError(null);
    try {
      await login(serverUrl, selected.username, pin);
      router.replace("/scan");
    } catch (err) {
      setPinError("Incorrect PIN. Try again.");
      setPin("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        {selected ? (
          <Pressable
            onPress={() => {
              setSelected(null);
              setPin("");
              setPinError(null);
            }}
            style={styles.backButton}
            hitSlop={12}
          >
            <ChevronLeft size={22} color={colors.slate700} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <ConnectivityBadge />
      </View>

      {config ? (
        <Text style={styles.counterLabel}>{config.counterName}</Text>
      ) : null}

      {!selected ? (
        <>
          <Text style={styles.title}>Who's scanning?</Text>
          {loadingStaff ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : loadError ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => serverUrl && loadStaff(serverUrl)}
              >
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <StaffPicker staff={staff} onSelect={setSelected} />
          )}
        </>
      ) : (
        <View style={styles.pinSection}>
          <Text style={styles.title}>Hi, {selected.name}</Text>
          <Text style={styles.subtitle}>Enter your PIN</Text>
          <View style={{ marginTop: 24 }}>
            <PinPad
              value={pin}
              onChange={setPin}
              onSubmit={submitPin}
              submitting={submitting}
              error={pinError}
            />
          </View>
        </View>
      )}

      <Pressable
        style={styles.settingsLink}
        onPress={() => router.push("/settings")}
        hitSlop={12}
      >
        <Settings size={16} color={colors.slate400} />
        <Text style={styles.settingsText}>Device settings</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, padding: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  backButton: { flexDirection: "row", alignItems: "center" },
  backText: { color: colors.slate700, fontFamily: fonts.medium, fontSize: 15 },
  counterLabel: {
    textAlign: "center",
    color: colors.slate500,
    fontFamily: fonts.medium,
    fontSize: 12,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  title: {
    ...type.h2,
    fontFamily: fonts.bold,
    color: colors.slate900,
    textAlign: "center",
    marginTop: 16,
  },
  subtitle: {
    ...type.body,
    fontFamily: fonts.regular,
    color: colors.slate600,
    textAlign: "center",
    marginTop: 4,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  errorText: { color: colors.slate600, fontFamily: fonts.regular, textAlign: "center" },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: colors.slate100,
    borderRadius: 10,
  },
  retryText: { color: colors.slate700, fontFamily: fonts.semibold },
  pinSection: { flex: 1, alignItems: "center", paddingTop: 24 },
  settingsLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  settingsText: { color: colors.slate400, fontFamily: fonts.medium, fontSize: 12 },
});
