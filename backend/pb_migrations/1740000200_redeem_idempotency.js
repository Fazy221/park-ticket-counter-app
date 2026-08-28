/// <reference path="../pb_data/types.d.ts" />

// Backs a true idempotency key on /api/redeem (see redeem.pb.js). One row
// per client-generated idempotency_key, storing exactly the JSON response
// that request produced the first time it was seen. A retry that lands
// after the original already committed replays this verbatim instead of
// re-deriving a result from ticket state - that's what closes the
// "connection dropped between commit and response reaching the phone" gap
// flagged in the README. The old fallback (queue.ts's resolveSynced)
// guessed based on matching staff+counter on the "already redeemed"
// response; this is exact by construction, since the key is unique per
// scan attempt rather than inferred after the fact.
//
// Separate collection rather than a column on ticket_events on purpose -
// this isn't part of the audit trail (an idempotent replay isn't a new
// event that happened), it's transport-layer bookkeeping with its own
// lifecycle: rows here get pruned after ~48h (see cleanup.pb.js) while
// ticket_events rows are kept forever.
migrate((app) => {
  const attempts = new Collection({
    type: "base",
    name: "redeem_attempts",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "idempotency_key", type: "text", required: true, max: 100 },
      // The exact response body /api/redeem returned the first time this
      // key was seen - replayed verbatim on retry, never recomputed.
      { name: "result_json", type: "text", required: true, max: 2000 },
      // Drives the prune window in cleanup.pb.js.
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_redeem_attempts_key ON redeem_attempts (idempotency_key)",
    ],
  });
  app.save(attempts);
}, (app) => {
  const c = app.findCollectionByNameOrId("redeem_attempts");
  if (c) app.delete(c);
});
