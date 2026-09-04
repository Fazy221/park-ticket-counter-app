import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { MapPin, ArrowRight, Search } from "lucide-react-native";
import { colors } from "@/theme/colors";
import { fonts, type } from "@/theme/typography";
import { fetchCounters, CounterLite } from "@/lib/api";
import { normalizeServerUrl, setDeviceConfig } from "@/lib/deviceConfig";
import { setServerUrlFromSetup } from "@/lib/serverConnection";
import { discoverServerColdStart } from "@/lib/serverDiscovery";
import { startBackgroundServices } from "@/lib/bootstrap";

type Step = "server" | "counter";

export default function Setup() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("server");
  const [serverInput, setServerInput] = useState("http://");
  const [serverUrl, setServerUrl] = useState("");
  const [counters, setCounters] = useState<CounterLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectTo = async (normalized: string) => {
    const list = await fetchCounters(normalized);
    if (list.length === 0) {
      setError("Connected, but no active counters are set up yet. Add one in the web dashboard first.");
      return;
    }
    setServerUrl(normalized);
    setCounters(list);
    setStep("counter");
  };

  const findCounters = async () => {
    setError(null);
    const normalized = normalizeServerUrl(serverInput);
    if (!/^https?:\/\/.+/.test(normalized)) {
      setError("Enter the server address including http://, e.g. http://192.168.1.50:8090");
      return;
    }
    setLoading(true);
    try {
      await connectTo(normalized);
    } catch (err) {
      setError("Could not reach that address. Check the device is on the same Wi-Fi as the server.");
    } finally {
      setLoading(false);
    }
  };

  // Sweeps the local subnet for a host that identifies itself as the
  // GateMark server (same mechanism serverDiscovery.ts uses afterward to
  // self-heal a changed IP - see README "Deployment hardening" item 1),
  // instead of requiring whoever's setting up a new device to go find the
  // laptop's current IP by hand. Assumes the default port (8090); falls
  // back to a clear message if nothing answers so they can still type an
  // address in manually.
  const findServerAutomatically = async () => {
    setError(null);
    setFinding(true);
    try {
      const found = await discoverServerColdStart();
      if (!found) {
        setError("Couldn't find a GateMark server on this Wi-Fi network. Enter its address manually below.");
        return;
      }
      setServerInput(found);
      await connectTo(found);
    } catch {
      setError("Couldn't find a GateMark server on this Wi-Fi network. Enter its address manually below.");
    } finally {
      setFinding(false);
    }
  };

  const pickCounter = async (counter: CounterLite) => {
    await setDeviceConfig({ serverUrl, counterId: counter.id, counterName: counter.name });
    setServerUrlFromSetup(serverUrl);
    startBackgroundServices();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        {step === "server" ? (
          <View style={styles.content}>
            <Text style={styles.title}>Set up this device</Text>
            <Text style={styles.subtitle}>
              Enter the local server address shown on the staff laptop. This is a one-time setup
              per device.
            </Text>
            <TextInput
              style={styles.input}
              value={serverInput}
              onChangeText={setServerInput}
              placeholder="http://192.168.1.50:8090"
              placeholderTextColor={colors.slate400}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.primaryButton, loading && styles.disabled]}
              onPress={findCounters}
              disabled={loading || finding}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Text style={styles.primaryButtonText}>Continue</Text>
                  <ArrowRight size={18} color={colors.white} />
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.secondaryButton, finding && styles.disabled]}
              onPress={findServerAutomatically}
              disabled={loading || finding}
            >
              {finding ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <Search size={16} color={colors.primary} />
                  <Text style={styles.secondaryButtonText}>Find server automatically</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <View style={styles.content}>
            <Text style={styles.title}>Which counter is this?</Text>
            <Text style={styles.subtitle}>Pick the counter this device will scan at.</Text>
            <FlatList
              data={counters}
              keyExtractor={(c) => c.id}
              style={{ marginTop: 16 }}
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.counterRow, pressed && styles.counterRowPressed]}
                  onPress={() => pickCounter(item)}
                >
                  <MapPin size={20} color={colors.primary} />
                  <Text style={styles.counterName}>{item.name}</Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.backLink} onPress={() => setStep("server")}>
              <Text style={styles.backLinkText}>Use a different server address</Text>
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  content: { flex: 1, padding: 24, justifyContent: "center" },
  title: { ...type.h1, fontFamily: fonts.bold, color: colors.slate900 },
  subtitle: { ...type.body, color: colors.slate600, fontFamily: fonts.regular, marginTop: 8 },
  input: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.slate300,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.slate900,
    fontFamily: fonts.medium,
  },
  error: { color: colors.danger, marginTop: 12, fontFamily: fonts.medium, fontSize: 13 },
  primaryButton: {
    marginTop: 20,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  disabled: { opacity: 0.7 },
  primaryButtonText: { color: colors.white, fontSize: 16, fontFamily: fonts.semibold },
  secondaryButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.slate300,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  secondaryButtonText: { color: colors.primary, fontSize: 15, fontFamily: fonts.semibold },
  counterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.slate200,
    borderRadius: 12,
    marginBottom: 10,
  },
  counterRowPressed: { backgroundColor: colors.slate100 },
  counterName: { fontSize: 16, color: colors.slate800, fontFamily: fonts.medium },
  backLink: { marginTop: 16, alignItems: "center" },
  backLinkText: { color: colors.slate500, fontFamily: fonts.medium, fontSize: 13 },
});
