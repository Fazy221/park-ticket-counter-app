/// <reference path="../pb_data/types.d.ts" />

// Prunes redeem_attempts rows older than the retry window that idempotency
// keys actually need to cover. See 1740000200_redeem_idempotency.js for why
// this collection exists and why it's separate from ticket_events: this is
// transport-layer bookkeeping (replay cache for a lost response), not part
// of the permanent audit trail, so it's fine - correct, even - to let it go.
//
// 48h is deliberately generous next to how long a real retry gap ever is
// (device reconnects within seconds to minutes in practice); the margin
// just means a device that's fully offline for a day and a half still gets
// exact replay instead of falling through to re-processing against
// possibly-changed ticket state.
const RETENTION_HOURS = 48;

cronAdd("prune_redeem_attempts", "0 * * * *", () => {
  // toISOString() gives "...T...Z"; PocketBase's stored "created" values
  // use "... ...Z" (space instead of "T"). This is a raw SQL string
  // comparison, so the mismatch matters the same way it did in
  // session_log.pb.js: a "T"-formatted cutoff sorts *after* any
  // same-day "created" value regardless of actual time-of-day, which
  // means rows from earlier today were being treated as always older
  // than the cutoff - i.e. eligible for deletion well before the 48h
  // retention window actually elapsed. Normalizing to match storage
  // format fixes the comparison.
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000)
    .toISOString()
    .replace("T", " ");
  const result = $app
    .db()
    .newQuery("DELETE FROM redeem_attempts WHERE created < {:cutoff}")
    .bind({ cutoff })
    .execute();
  const removed = result.rowsAffected();
  if (removed > 0) {
    console.log(`prune_redeem_attempts: removed ${removed} row(s) older than ${RETENTION_HOURS}h`);
  }
});