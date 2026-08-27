import { useEffect, useCallback } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { View } from "react-native";
import { AuthProvider } from "@/context/AuthContext";
import { initDb } from "@/lib/db";
import { getDeviceConfig } from "@/lib/deviceConfig";
import { startBackgroundServices } from "@/lib/bootstrap";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op - fine if this is called after it's already hidden */
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    // The queue table needs to exist before the scan screen can enqueue
    // anything - init it once, here, ahead of any screen mounting.
    initDb();

    // If this device already went through setup in a previous session,
    // start draining the queue and watching connectivity right away -
    // don't wait for a login. (setup.tsx starts these itself the moment
    // setup completes, for a device's first run.)
    getDeviceConfig().then((config) => {
      if (config) startBackgroundServices(config.serverUrl);
    });
  }, []);

  const onLayout = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="setup" />
          <Stack.Screen name="login" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="(app)" />
        </Stack>
      </AuthProvider>
    </View>
  );
}
