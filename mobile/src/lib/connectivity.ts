import NetInfo from "@react-native-community/netinfo";
import { checkServerReachable } from "./api";

// WHY NOT JUST NetInfo.isInternetReachable: that flag reflects whether the
// device can reach the public internet (NetInfo's default reachability
// probe), which is exactly the thing this app is designed to keep working
// without (plan section 2 - "works entirely on the local network, no
// internet required"). A device with zero internet but a healthy LAN link
// to the on-site PocketBase server is "connected" for this app's purposes.
// So the source of truth here is an actual GET /api/health against the
// configured server; NetInfo is only used as a trigger to re-check sooner
// after a Wi-Fi reconnect, not as the answer itself.

type Listener = (connected: boolean) => void;
const listeners = new Set<Listener>();

let currentState = false;
let pollHandle: ReturnType<typeof setInterval> | null = null;
let netInfoUnsubscribe: (() => void) | null = null;

function setState(connected: boolean) {
  if (connected !== currentState) {
    currentState = connected;
    listeners.forEach((l) => l(connected));
  }
}

export function getConnectivityState(): boolean {
  return currentState;
}

export function subscribeToConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(currentState);
  return () => listeners.delete(listener);
}

export function startConnectivityMonitor(serverUrl: string, pollMs = 7000): () => void {
  stopConnectivityMonitor();

  const check = () => {
    checkServerReachable(serverUrl).then(setState);
  };

  check();
  pollHandle = setInterval(check, pollMs);
  // Re-check promptly on any network state change (Wi-Fi reconnect, etc.)
  // rather than waiting for the next poll tick.
  netInfoUnsubscribe = NetInfo.addEventListener(() => check());

  return stopConnectivityMonitor;
}

export function stopConnectivityMonitor(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
}
