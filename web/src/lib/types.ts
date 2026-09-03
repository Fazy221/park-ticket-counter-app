// Mirrors the schema in backend/pb_migrations/1740000000_create_gatemark_schema.js
// and 1740000100_staff_auth.js. Kept as a hand-written source of truth here
// rather than generated, same as the mobile app's src/lib/api.ts types -
// there's no PocketBase TS-generation step wired into this project.
//
// collectionId/collectionName are real fields PocketBase includes on every
// record response - kept here (rather than omitted as "internal") so these
// types satisfy the SDK's own RecordModel constraint used by useLiveList.
//
// NOTE: none of these collections have PocketBase's system created/updated
// autodate fields - they were defined via migration with an explicit
// `fields: [...]` list that never included them (confirmed against a real
// running instance), unlike collections created through the dashboard
// which get them by default. Don't add created/updated back here, and
// don't sort by them - ticket_events has its own explicit `server_time`
// autodate field for that purpose; tickets/counters/staff have no
// creation-order field to sort by at all.

export type TicketStatus = "valid" | "redeemed" | "void";

export type Ticket = {
  id: string;
  collectionId: string;
  collectionName: string;
  qr_code: string;
  assigned_number: number | null;
  status: TicketStatus;
  staff_id: string | null;
  counter_id: string | null;
  scanned_at: string | null;
};

export type TicketEventType =
  | "scanned"
  | "duplicate_attempt"
  | "conflict_flagged"
  | "conflict_resolved"
  | "voided"
  | "reopened";

export type TicketEvent = {
  id: string;
  collectionId: string;
  collectionName: string;
  ticket_id: string;
  event_type: TicketEventType;
  actor_staff_id: string | null;
  counter_id: string | null;
  device_scan_time: string | null;
  server_time: string;
  note: string;
};

export type StaffRole = "counter_staff" | "superadmin";

export type Staff = {
  id: string;
  collectionId: string;
  collectionName: string;
  name: string;
  username: string;
  role: StaffRole;
  active: boolean;
};

export type Counter = {
  id: string;
  collectionId: string;
  collectionName: string;
  name: string;
  active: boolean;
};
