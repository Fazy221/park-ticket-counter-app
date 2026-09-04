import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";

// Deployment hardening item 1 (see README's "Deployment hardening - action
// plan"): the venue router can hand the server laptop a new DHCP lease at
// any point - reboot, firmware update, power blip - and until now nothing
// re-discovered it. Every counter device was hard-pinned to whatever IP it
// got at setup and broke silently the moment that changed. This module is
// the fix's LAN-scan half: given the last address that worked, sweep the
// local subnet for the host that answers /api/discover as "gatemark".
//
// Scoped to a /24 (254 candidate hosts), not a general CIDR scan: this app
// is explicitly single-venue (see README "Origin & architecture"), and a
// /24 is what the overwhelming majority of small routers hand out by
// default. If a venue's network is genuinely larger than that, the other
// half of item 1 - a static DHCP reservation for the laptop's MAC address -
// is the right tool anyway; this scan is a safety net for venues that
// don't (or can't) do that, not a replacement for it.

const PROBE_TIMEOUT_MS = 700;
const SCAN_CONCURRENCY = 20;
// Don't re-scan on every single failed request - the vast majority of
// "can't reach the server" moments are just the Wi-Fi briefly dropping,
// not the IP actually changing, and a subnet sweep isn't free (up to ~254
// requests, plus battery/radio wake-ups). One scan every 20s is still fast
// enough to self-heal well within a shift.
const MIN_RESCAN_INTERVAL_MS = 20000;

let lastScanAt = 0;
let inFlightScan: Promise<string | null> | null = null;

function parsePort(serverUrl: string): string | null {
  const match = serverUrl.match(/^https?:\/\/[^/]+?:(\d+)/);
  return match ? match[1] : null;
}

async function isGateMarkServer(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/discover`, { signal: controller.signal });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json && json.service === "gatemark";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Only wifi/ethernet NetInfo states carry ipAddress/subnet - cellular,
// bluetooth, etc. don't, and this app should never be talking to the
// server over anything else anyway (see connectivity.ts).
async function getOwnSubnet(): Promise<{ prefix: string; ownLastOctet: number } | null> {
  const state = await NetInfo.fetch();
  const details =
    state.type === NetInfoStateType.wifi || state.type === NetInfoStateType.ethernet
      ? state.details
      : null;
  const ip = details?.ipAddress;
  if (!ip || ip === "0.0.0.0") return null;

  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const ownLastOctet = Number(parts[3]);
  if (Number.isNaN(ownLastOctet)) return null;

  return { prefix: `${parts[0]}.${parts[1]}.${parts[2]}.`, ownLastOctet };
}

async function scanBatch(urls: string[]): Promise<string | null> {
  const results = await Promise.all(
    urls.map(async (url) => ((await isGateMarkServer(url)) ? url : null))
  );
  return results.find((r): r is string => r !== null) ?? null;
}

function buildCandidates(prefix: string, port: string, skipLastOctet: number | null): string[] {
  const candidates: string[] = [];
  for (let i = 1; i <= 254; i++) {
    if (i === skipLastOctet) continue; // that's this device, not the server
    candidates.push(`http://${prefix}${i}:${port}`);
  }
  return candidates;
}

async function sweepSubnet(port: string, skipLastOctet: number | null): Promise<string | null> {
  const subnet = await getOwnSubnet();
  if (!subnet) return null;
  const candidates = buildCandidates(subnet.prefix, port, skipLastOctet);
  for (let i = 0; i < candidates.length; i += SCAN_CONCURRENCY) {
    const found = await scanBatch(candidates.slice(i, i + SCAN_CONCURRENCY));
    if (found) return found;
  }
  return null;
}

// Tries the last-known address first (cheap - covers "briefly unreachable"
// without a scan), then sweeps the rest of the /24. Throttled so it's safe
// to call from more than one place (connectivity polling, queue sync)
// without the callers needing to coordinate.
export async function discoverServer(lastKnownUrl: string): Promise<string | null> {
  if (inFlightScan) return inFlightScan;

  const now = Date.now();
  if (now - lastScanAt < MIN_RESCAN_INTERVAL_MS) return null;
  lastScanAt = now;

  inFlightScan = (async () => {
    if (await isGateMarkServer(lastKnownUrl)) return lastKnownUrl;

    const port = parsePort(lastKnownUrl);
    if (!port) return null;

    const subnet = await getOwnSubnet();
    return sweepSubnet(port, subnet?.ownLastOctet ?? null);
  })();

  try {
    return await inFlightScan;
  } finally {
    inFlightScan = null;
  }
}

// Cold-start variant for the setup screen's "Find server automatically"
// option: no last-known address to try first, and not throttled the same
// way since it's a deliberate, one-off, user-initiated action rather than
// a background recovery loop.
export async function discoverServerColdStart(port = "8090"): Promise<string | null> {
  const subnet = await getOwnSubnet();
  return sweepSubnet(port, subnet?.ownLastOctet ?? null);
}
