import { getDeviceConfig, updateServerUrl } from "./deviceConfig";
import { discoverServer } from "./serverDiscovery";

// The single live source of truth for "what address is the server at right
// now". deviceConfig.ts still owns the one-time, persisted setup (server +
// counter chosen once at setup time) - this module is what keeps that
// address current afterward.
//
// Before this existed, every caller that needed the server's address got
// it once, from useDeviceConfig() or a value captured at bootstrap, and
// kept using that same string for the rest of the app's life even if the
// server moved (README "Deployment hardening" item 1 - "every device is
// hard-pinned to it"). connectivity.ts and queue.ts now read the address
// from here on every poll/sync tick instead of holding their own copy, and
// call recoverServerUrl() the moment that address stops answering, so a
// DHCP-reassigned IP self-heals instead of taking the whole system down
// until someone re-runs setup on every device by hand.

let current: string | null = null;
let initialized = false;

type Listener = (serverUrl: string) => void;
const listeners = new Set<Listener>();

// Call once, at app boot, before starting the connectivity monitor or
// auto-sync - both read getServerUrl() and need it populated first.
export async function initServerConnection(): Promise<string | null> {
  if (!initialized) {
    const config = await getDeviceConfig();
    current = config?.serverUrl ?? null;
    initialized = true;
  }
  return current;
}

// setup.tsx writes the full device config (server + counter) itself via
// deviceConfig.setDeviceConfig - this just tells the in-memory copy here
// about the address too, so background services started right after setup
// completes don't need an app restart to pick it up.
export function setServerUrlFromSetup(url: string): void {
  current = url;
  initialized = true;
}

export function getServerUrl(): string | null {
  return current;
}

// Used by settings.tsx's "change server" / "forget device" flows, which
// already clear the persisted config via deviceConfig.clearDeviceConfig()
// and stop the background monitors - this clears the in-memory copy here
// too, so nothing in this JS session could still hand out the old address
// (e.g. a stray call between "cleared" and the next setup completing).
export function resetServerConnection(): void {
  current = null;
}

export function subscribeToServerUrl(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function adopt(url: string): Promise<void> {
  if (url === current) return;
  current = url;
  listeners.forEach((l) => l(url));
  await updateServerUrl(url);
}

// Called by connectivity.ts's poll and queue.ts's sync loop whenever a
// request against the current address fails to connect at all - not on
// every request, since most such failures are just the Wi-Fi briefly
// dropping rather than the server having actually moved. Safe to call from
// more than one place without coordinating: the scan itself is throttled
// and de-duplicated inside serverDiscovery.ts.
export async function recoverServerUrl(): Promise<string | null> {
  if (!current) return null;
  const found = await discoverServer(current);
  if (found) await adopt(found);
  return found;
}
