import { useEffect, useState } from "react";
import { getConnectivityState, subscribeToConnectivity } from "@/lib/connectivity";

// Just subscribes to the module-level connectivity state set up by
// startConnectivityMonitor() in app/(app)/_layout.tsx - this hook doesn't
// start or stop the monitor itself, so it's safe to use from any number of
// components at once.
export function useConnectivity(): boolean {
  const [connected, setConnected] = useState(getConnectivityState());
  useEffect(() => subscribeToConnectivity(setConnected), []);
  return connected;
}
