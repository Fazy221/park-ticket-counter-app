import { getDb, initDb, PendingScanRow } from "./db";
import { redeemTicket, RedeemResult, NetworkError, ApiError } from "./api";
import { getStaffToken } from "./authTokenCache";
import { generateUuid } from "./uuid";

// ---- tiny pub/sub so screens can react to queue changes without polling --
type Listener = () => void;
const listeners = new Set<Listener>();
function notify() {
  listeners.forEach((l) => l());
}
export function subscribeToQueueChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let initialized = false;
async function ensureReady() {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
}

export async function enqueueScan(input: {
  qr_code: string;
  counter_id: string;
  staff_id: string;
  device_scan_time: string;
}): Promise<number> {
  await ensureReady();
  const db = getDb();
  const now = new Date().toISOString();
  // One key per scan attempt (this call), not per sync try - every retry
  // of this same row over the network resends this exact key, which is
  // what lets the server tell "lost-response retry" apart from a genuine
  // second scan of the same ticket. See resolveSynced below and
  // redeem.pb.js.
  const idempotencyKey = generateUuid();
  const result = await db.runAsync(
    `INSERT INTO pending_scans (qr_code, counter_id, staff_id, device_scan_time, idempotency_key, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [input.qr_code, input.counter_id, input.staff_id, input.device_scan_time, idempotencyKey, now]
  );
  notify();
  return result.lastInsertRowId;
}

export async function getPendingCount(): Promise<number> {
  await ensureReady();
  const db = getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) as n FROM pending_scans WHERE status IN ('pending', 'syncing')`
  );
  return row?.n ?? 0;
}

export async function getScanById(id: number): Promise<PendingScanRow | null> {
  await ensureReady();
  const db = getDb();
  return db.getFirstAsync<PendingScanRow>(`SELECT * FROM pending_scans WHERE id = ?`, [id]);
}

// Every queue row created today, any status - used by the Session log
// screen to show "pending sync" items alongside what's already confirmed.
export async function getTodaysScans(): Promise<PendingScanRow[]> {
  await ensureReady();
  const db = getDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return db.getAllAsync<PendingScanRow>(
    `SELECT * FROM pending_scans WHERE created_at >= ? ORDER BY created_at DESC`,
    [startOfDay.toISOString()]
  );
}

let syncing = false;

// Drains the queue oldest-first against the server. Stops at the first
// NetworkError (no point burning through the rest if the LAN link is
// down) but keeps going past ApiErrors (a rejected item - unknown QR,
// inactive counter - is a real, permanent failure, not a connectivity
// problem, and shouldn't block everything queued after it).
export async function syncPendingItems(serverUrl: string): Promise<void> {
  if (syncing) return; // don't overlap a periodic tick with a manual "sync now"
  syncing = true;
  try {
    await ensureReady();
    const db = getDb();
    const pending = await db.getAllAsync<PendingScanRow>(
      `SELECT * FROM pending_scans WHERE status = 'pending' ORDER BY created_at ASC`
    );

    for (const item of pending) {
      await db.runAsync(`UPDATE pending_scans SET status = 'syncing' WHERE id = ?`, [item.id]);
      notify();

      const token = await getStaffToken(item.staff_id);
      if (!token) {
        // The staff member who made this scan has no cached credential on
        // this device at all (cache wiped, or a very unusual state) -
        // this can't self-heal by retrying, so fail it loudly rather than
        // spin on it forever.
        await db.runAsync(
          `UPDATE pending_scans SET status = 'failed', error = ? WHERE id = ?`,
          ["No cached login for this staff member on this device", item.id]
        );
        notify();
        continue;
      }

      try {
        const result = await redeemTicket(serverUrl, token, {
          qr_code: item.qr_code,
          counter_id: item.counter_id,
          idempotency_key: item.idempotency_key,
          device_scan_time: item.device_scan_time,
          // Tells the server this attempt sat in a real offline-pending
          // state (staff saw "Pending sync", not an instant result) at
          // some point before this attempt - see the was_offline_pending
          // update just below for how that gets set. Lets redeem.pb.js
          // tell a genuine race (conflict_flagged) apart from an ordinary
          // live duplicate scan (duplicate_attempt).
          was_queued_offline: !!item.was_offline_pending,
        });
        await resolveSynced(item, result);
      } catch (err) {
        if (err instanceof NetworkError) {
          // Connection dropped again mid-drain - put this item back to
          // 'pending' and stop; the next tick or reconnect picks up here.
          // This is a *real* offline failure (not a lost-response retry -
          // those come back as ApiError/success, never NetworkError), so
          // this is exactly the "device was showing Pending sync" moment
          // the README's conflict definition is about. Flag it permanently
          // (never cleared) so that whenever this row does eventually
          // resolve - possibly several ticks from now - the server knows
          // to check it against a conflict, not just a plain duplicate.
          await db.runAsync(
            `UPDATE pending_scans SET status = 'pending', was_offline_pending = 1 WHERE id = ?`,
            [item.id]
          );
          notify();
          return;
        }
        const message = err instanceof ApiError ? err.message : "Unexpected sync error";
        await db.runAsync(`UPDATE pending_scans SET status = 'failed', error = ? WHERE id = ?`, [
          message,
          item.id,
        ]);
        notify();
      }
    }
  } finally {
    syncing = false;
  }
}

async function resolveSynced(item: PendingScanRow, result: RedeemResult): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // No more staff+counter guessing here: the server keys its idempotency
  // cache on item.idempotency_key (see redeem.pb.js), so a lost-response
  // retry of this exact row comes back with the original "valid" result
  // verbatim - not "already redeemed" - and a real duplicate scan (a fresh
  // row, fresh key) correctly comes back as a conflict instead of being
  // mistaken for a successful retry. result.status is trustworthy as-is.
  await db.runAsync(
    `UPDATE pending_scans
     SET status = 'synced', result_status = ?, result_json = ?, synced_at = ?
     WHERE id = ?`,
    [result.status, JSON.stringify(result), now, item.id]
  );
  notify();
}

// Manual retry for a row stuck in 'failed' - surfaced as a button in the
// Session log / Undo UI rather than auto-retried, since a failed item was
// rejected by the server for a reason that (mostly) won't fix itself.
export async function retryFailedItem(serverUrl: string, id: number): Promise<void> {
  await ensureReady();
  const db = getDb();
  await db.runAsync(`UPDATE pending_scans SET status = 'pending', error = NULL WHERE id = ?`, [id]);
  notify();
  await syncPendingItems(serverUrl);
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(serverUrl: string, intervalMs = 5000): () => void {
  stopAutoSync();
  intervalHandle = setInterval(() => {
    syncPendingItems(serverUrl).catch(() => {
      /* errors are recorded per-item above; nothing else to do here */
    });
  }, intervalMs);
  return stopAutoSync;
}

export function stopAutoSync(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
