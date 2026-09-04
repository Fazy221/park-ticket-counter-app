import { startConnectivityMonitor } from "./connectivity";
import { startAutoSync } from "./queue";

// Deliberately not scoped to the logged-in (app) route group: the offline
// queue can hold scans from a staff member who has since logged out (see
// authTokenCache.ts), and those still need to drain in the background even
// while the device is sitting at the login screen during a shift change.
// Safe to call more than once - both underlying monitors clear their
// previous interval before starting a new one.
//
// No serverUrl parameter: both underlying monitors now read the current
// address live from serverConnection.ts on every tick instead of holding a
// copy captured here at startup - see that module's header comment and
// README "Deployment hardening" item 1. Call initServerConnection() (or
// serverConnection.setServerUrlFromSetup()) before this, so there's
// actually a value for them to read.
export function startBackgroundServices(): void {
  startConnectivityMonitor();
  startAutoSync();
}
