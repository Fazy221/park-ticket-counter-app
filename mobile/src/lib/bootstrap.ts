import { startConnectivityMonitor } from "./connectivity";
import { startAutoSync } from "./queue";

// Deliberately not scoped to the logged-in (app) route group: the offline
// queue can hold scans from a staff member who has since logged out (see
// authTokenCache.ts), and those still need to drain in the background even
// while the device is sitting at the login screen during a shift change.
// Safe to call more than once - both underlying monitors clear their
// previous interval before starting a new one.
export function startBackgroundServices(serverUrl: string): void {
  startConnectivityMonitor(serverUrl);
  startAutoSync(serverUrl);
}
