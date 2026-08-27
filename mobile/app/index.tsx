import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import { getDeviceConfig } from "@/lib/deviceConfig";
import { useAuth } from "@/context/AuthContext";
import { colors } from "@/theme/colors";

type Target = "setup" | "login" | "app" | null;

export default function Index() {
  const { staff, loading: authLoading } = useAuth();
  const [configChecked, setConfigChecked] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);

  useEffect(() => {
    getDeviceConfig().then((config) => {
      setHasConfig(config !== null);
      setConfigChecked(true);
    });
  }, []);

  if (!configChecked || authLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const target: Target = !hasConfig ? "setup" : !staff ? "login" : "app";

  if (target === "setup") return <Redirect href="/setup" />;
  if (target === "login") return <Redirect href="/login" />;
  return <Redirect href="/scan" />;
}
