import { useEffect, useCallback, useRef } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from "@expo-google-fonts/inter";
import { View, AppState, AppStateStatus } from "react-native";
import { AuthProvider } from "@/context/AuthContext";
import { initDb } from "@/lib/db";
import { initServerConnection } from "@/lib/serverConnection";
import { startBackgroundServices } from "@/lib/bootstrap";
import { startKioskMode } from "@/lib/kioskMode";

SplashScreen.preventAutoHideAsync().catch(() => {
  /* no-op - fine if this is called after it's already hidden */
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (fontError) console.log("FONT ERROR:", fontError);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initDb();

    initServerConnection().then((serverUrl) => {
      if (serverUrl) startBackgroundServices();
    });

    startKioskMode();

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === "active") {
        startKioskMode();
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, []);

  const onLayout = useCallback(async () => {
    if (fontsLoaded) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded && !fontError) {
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