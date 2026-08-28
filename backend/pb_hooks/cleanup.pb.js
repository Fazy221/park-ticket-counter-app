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
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000).toISOString();
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
