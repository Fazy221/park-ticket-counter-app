import { useEffect, useState } from "react";
import { getServerUrl, subscribeToServerUrl } from "@/lib/serverConnection";

// Reactive read of the live server address. Unlike useDeviceConfig (a
// one-time AsyncStorage read that never changes after mount), this updates
// automatically if serverConnection.ts rediscovers the server at a new
// address mid-session (README "Deployment hardening" item 1). Screens that
// make their own direct API calls (login, live directory lookups, undo)
// should use this instead of config.serverUrl; deviceConfig's serverUrl is
// still what's persisted to disk and is fine for one-time display (the
// Settings screen).
export function useServerUrl(): string | null {
  const [url, setUrl] = useState<string | null>(getServerUrl());
  useEffect(() => subscribeToServerUrl(setUrl), []);
  return url;
}
