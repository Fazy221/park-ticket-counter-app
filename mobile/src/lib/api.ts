// Plain-fetch client for the GateMark backend's custom routes. Deliberately
// not using the `pocketbase` SDK package: every staff-facing operation goes
// through a custom /api/* route (see backend/pb_hooks), never the generic
// Records API, so the SDK would only be buying us the login helper - and
// this app needs to authenticate individual requests with a *specific*
// cached staff token (see authTokenCache.ts), not whatever the SDK's
// single shared authStore currently holds. Plain fetch makes that
// per-request control straightforward instead of fighting the SDK for it.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// Distinguishes "server said no" from "couldn't reach the server at all" -
// the queue and UI need to react very differently to each (see queue.ts).
export class NetworkError extends Error {
  constructor(message = "Could not reach the local server") {
    super(message);
    this.name = "NetworkError";
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

async function request<T>(
  serverUrl: string,
  path: string,
  opts: { method?: string; body?: unknown; token?: string; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${serverUrl}${path}`, {
      method: opts.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(opts.token ? { Authorization: opts.token } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    // Covers both "no route to host" (LAN down) and the abort timeout -
    // from the caller's point of view both mean "couldn't sync right now".
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    // empty body is fine for some responses; ignore parse failure here and
    // let the status check below decide if it was actually an error
  }

  if (!res.ok) {
    throw new ApiError(res.status, json?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}

// ---- types matching the backend's response shapes ------------------------

export type StaffLite = { id: string; name: string; username: string };
export type CounterLite = { id: string; name: string };

// The backend's /api/staff-login route returns $apis.recordAuthResponse(),
// PocketBase's standard { token, record } auth shape - not a custom one.
export type LoginResult = {
  token: string;
  record: { id: string; name: string; role: "counter_staff" | "superadmin"; username: string };
};

export type RedeemResult =
  | { status: "valid"; ticket_id: string; assigned_number: number; scanned_at: string }
  | {
      status: "redeemed" | "void";
      ticket_id: string;
      assigned_number: number | null;
      original_staff_id: string | null;
      original_counter_id: string | null;
      original_scanned_at: string | null;
      // True when this duplicate was logged as ticket_events.conflict_flagged
      // rather than duplicate_attempt - i.e. this device's own queued scan
      // lost a race against an earlier sync, not a live rejection. Not
      // currently branched on anywhere in the mobile UI (that's the web
      // superadmin's Conflicts queue); carried through mainly so it's
      // visible in result_json for debugging without a server round trip.
      conflict?: boolean;
    };

export type SessionLogEntry = {
  id: string;
  ticket_id: string;
  event_type: "scanned" | "duplicate_attempt";
  actor_staff_id: string;
  server_time: string;
};

// ---- calls -----------------------------------------------------------

export function fetchStaffNames(serverUrl: string): Promise<StaffLite[]> {
  return request<StaffLite[]>(serverUrl, "/api/staff-names");
}

export function fetchCounters(serverUrl: string): Promise<CounterLite[]> {
  return request<CounterLite[]>(serverUrl, "/api/counters");
}

export function staffLogin(serverUrl: string, username: string, pin: string): Promise<LoginResult> {
  return request<LoginResult>(serverUrl, "/api/staff-login", {
    method: "POST",
    body: { username, pin },
  });
}

export function redeemTicket(
  serverUrl: string,
  token: string,
  body: {
    qr_code: string;
    counter_id: string;
    idempotency_key: string;
    device_scan_time?: string;
    was_queued_offline?: boolean;
  }
): Promise<RedeemResult> {
  return request<RedeemResult>(serverUrl, "/api/redeem", { method: "POST", body, token });
}

export function undoScan(
  serverUrl: string,
  token: string,
  ticket_id: string
): Promise<{ status: string; ticket_id: string }> {
  return request(serverUrl, "/api/undo-scan", { method: "POST", body: { ticket_id }, token });
}

export function fetchSessionLog(
  serverUrl: string,
  token: string,
  params: { counter_id: string; from: string; to: string }
): Promise<SessionLogEntry[]> {
  const qs = new URLSearchParams(params).toString();
  return request<SessionLogEntry[]>(serverUrl, `/api/session-log?${qs}`, { token });
}

export async function checkServerReachable(serverUrl: string): Promise<boolean> {
  try {
    await request(serverUrl, "/api/health", { timeoutMs: 3000 });
    return true;
  } catch {
    return false;
  }
}
