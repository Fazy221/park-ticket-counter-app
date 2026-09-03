import { pb } from "@/lib/pb";
import { ClientResponseError } from "pocketbase";

// Thin wrappers around the custom routes in backend/pb_hooks/ - same
// routes exist for a reason (atomicity + guaranteed audit-trail writes,
// see the comments on ticket_override.pb.js and conflict_resolve.pb.js),
// so the web app calls them exactly like the mobile app calls /api/redeem,
// rather than writing to tickets/ticket_events directly even though the
// Records API technically allows read access now.
async function callRoute<T>(path: string, body: unknown): Promise<T> {
  try {
    return await pb.send<T>(path, { method: "POST", body });
  } catch (err) {
    if (err instanceof ClientResponseError) {
      throw new Error(err.response?.message || "Request failed");
    }
    throw err;
  }
}

export function overrideTicket(params: {
  ticket_id: string;
  action: "void" | "reopen";
  note: string;
}): Promise<{ status: string; ticket_id: string }> {
  return callRoute("/api/ticket-override", params);
}

export function resolveConflict(params: {
  ticket_id: string;
  note: string;
}): Promise<{ ticket_id: string; resolved: boolean }> {
  return callRoute("/api/conflict-resolve", params);
}
