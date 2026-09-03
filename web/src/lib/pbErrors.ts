import { ClientResponseError } from "pocketbase";

// PocketBase's default auto-cancellation key is just `method + path` - it
// does NOT factor in filter/query params (confirmed by reading the SDK
// source: `t.requestKey || (t.method||"GET") + e`). That means two
// concurrent calls to the same collection's /records endpoint cancel each
// other even with completely different filters - which bit us for real:
// useOpenConflicts fires two concurrent ticket_events queries
// (conflict_flagged vs conflict_resolved), and useTicketStatusCounts fires
// three concurrent tickets queries (one per status) - both would
// intermittently cancel themselves out without a call-site-specific
// requestKey (see the requestKey usage added at each call site).
//
// An aborted request isn't a real failure - it's this app's own newer
// request winning a race - so it should never surface as a user-visible
// error or an unhandled rejection. This is what call sites check for
// before deciding whether to display/log an error.
export function isAutoCancel(err: unknown): boolean {
  return err instanceof ClientResponseError && err.isAbort;
}
