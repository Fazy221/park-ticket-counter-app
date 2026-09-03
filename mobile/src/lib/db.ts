import * as SQLite from "expo-sqlite";
import { generateUuid } from "./uuid";

// One local table: the offline scan queue. Everything else the app needs
// (staff list, counters, session log) is either fetched live or doesn't
// need to survive a restart, so it isn't cached here - keeps this the one
// piece of state that actually has to be bulletproof across app kills and
// device reboots mid-outage.
export type PendingScanRow = {
  id: number;
  qr_code: string;
  counter_id: string;
  staff_id: string; // who actually scanned it - see authTokenCache.ts
  device_scan_time: string; // ISO, device clock - display/audit only, never used for ordering
  idempotency_key: string; // one per scan attempt, resent verbatim on every retry - see queue.ts
  was_offline_pending: number; // 0/1 - set once a sync attempt for this row hits a real NetworkError; see queue.ts
  status: "pending" | "syncing" | "synced" | "failed";
  result_status: string | null; // 'valid' | 'redeemed' | 'void' once synced
  result_json: string | null;
  created_at: string;
  synced_at: string | null;
  error: string | null;
};

let db: SQLite.SQLiteDatabase | null = null;

export function getDb(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("gatemark.db");
  }
  return db;
}

export async function initDb(): Promise<void> {
  const database = getDb();
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS pending_scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      qr_code TEXT NOT NULL,
      counter_id TEXT NOT NULL,
      staff_id TEXT NOT NULL,
      device_scan_time TEXT NOT NULL,
      idempotency_key TEXT NOT NULL DEFAULT '',
      was_offline_pending INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      result_status TEXT,
      result_json TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT,
      error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_scans_status ON pending_scans (status);
    CREATE INDEX IF NOT EXISTS idx_pending_scans_created ON pending_scans (created_at);
  `);
  await ensureIdempotencyKeyColumn(database);
  await ensureWasOfflinePendingColumn(database);
}

// CREATE TABLE IF NOT EXISTS only covers a first-run device. A device that
// already had this table from before idempotency keys existed needs the
// column added in place - otherwise every scan attempt on that device
// would carry an empty key forever, and the server now rejects that.
// Existing queued rows (any status other than 'synced' - a synced row's
// key is never resent) get a freshly generated key here; that's fine
// because, from the server's point of view, the first request it ever
// sees for that key genuinely is this row's first attempt.
async function ensureIdempotencyKeyColumn(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(pending_scans)`);
  const hasColumn = columns.some((c) => c.name === "idempotency_key");
  if (hasColumn) return;

  await database.execAsync(
    `ALTER TABLE pending_scans ADD COLUMN idempotency_key TEXT NOT NULL DEFAULT ''`
  );
  const rowsNeedingKey = await database.getAllAsync<{ id: number }>(
    `SELECT id FROM pending_scans WHERE idempotency_key = ''`
  );
  for (const row of rowsNeedingKey) {
    await database.runAsync(`UPDATE pending_scans SET idempotency_key = ? WHERE id = ?`, [
      generateUuid(),
      row.id,
    ]);
  }
}

// Same pattern as ensureIdempotencyKeyColumn: a device with rows from
// before the conflict-detection column existed needs it added in place.
// Existing rows default to 0 ("not known to have been offline-pending"),
// which is the safe direction to guess wrong in - it just means a scan
// queued before this update, if it turns out to have raced another
// device, gets classified as an ordinary duplicate_attempt instead of
// conflict_flagged. That's the same category the server would have put
// it in anyway before this feature existed, so nothing regresses.
async function ensureWasOfflinePendingColumn(database: SQLite.SQLiteDatabase): Promise<void> {
  const columns = await database.getAllAsync<{ name: string }>(`PRAGMA table_info(pending_scans)`);
  const hasColumn = columns.some((c) => c.name === "was_offline_pending");
  if (hasColumn) return;

  await database.execAsync(
    `ALTER TABLE pending_scans ADD COLUMN was_offline_pending INTEGER NOT NULL DEFAULT 0`
  );
}
