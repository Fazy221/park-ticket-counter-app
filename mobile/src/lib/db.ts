import * as SQLite from "expo-sqlite";

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
}
