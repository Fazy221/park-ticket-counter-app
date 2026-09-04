import AsyncStorage from "@react-native-async-storage/async-storage";

// Plan section 9: each device is configured once, at setup, with the local
// server's LAN address and which physical counter it sits at. Neither is a
// secret, so plain AsyncStorage is fine here - SecureStore is reserved for
// auth tokens (see authTokenCache.ts).
const KEYS = {
  serverUrl: "gatemark:serverUrl",
  counterId: "gatemark:counterId",
  counterName: "gatemark:counterName",
};

export type DeviceConfig = {
  serverUrl: string; // e.g. "http://192.168.1.50:8090" - no trailing slash
  counterId: string;
  counterName: string;
};

export async function getDeviceConfig(): Promise<DeviceConfig | null> {
  const [serverUrl, counterId, counterName] = await Promise.all([
    AsyncStorage.getItem(KEYS.serverUrl),
    AsyncStorage.getItem(KEYS.counterId),
    AsyncStorage.getItem(KEYS.counterName),
  ]);
  if (!serverUrl || !counterId || !counterName) return null;
  return { serverUrl, counterId, counterName };
}

export async function setDeviceConfig(config: DeviceConfig): Promise<void> {
  await Promise.all([
    AsyncStorage.setItem(KEYS.serverUrl, config.serverUrl),
    AsyncStorage.setItem(KEYS.counterId, config.counterId),
    AsyncStorage.setItem(KEYS.counterName, config.counterName),
  ]);
}

export async function clearDeviceConfig(): Promise<void> {
  await AsyncStorage.multiRemove([KEYS.serverUrl, KEYS.counterId, KEYS.counterName]);
}

// Patches just the server address, leaving counter config untouched - used
// by serverConnection.ts after a successful LAN rediscovery (README
// "Deployment hardening" item 1), so the next app launch starts from the
// address that actually worked last, not the one from initial setup.
export async function updateServerUrl(serverUrl: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.serverUrl, serverUrl);
}

// Strips a trailing slash so callers can always do `${serverUrl}/api/...`
// without worrying whether the setup screen's input had one.
export function normalizeServerUrl(input: string): string {
  return input.trim().replace(/\/+$/, "");
}
