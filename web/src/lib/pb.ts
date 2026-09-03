import PocketBase from "pocketbase";

// Unlike the mobile app, this doesn't need a device-setup screen to ask
// "what's the server's LAN address?" - the web superadmin is a static
// build served directly out of PocketBase itself (see README), so it's
// always talking to whatever origin it was loaded from.
export const pb = new PocketBase(window.location.origin);

// Persists PocketBase's own authStore (localStorage-backed by default) so
// a superadmin doesn't have to re-enter their PIN every time the PWA
// window reopens. authStore.model is the `staff` record when logged in.
export type StaffRecord = {
  id: string;
  name: string;
  username: string;
  role: "counter_staff" | "superadmin";
  active: boolean;
};

export function currentStaff(): StaffRecord | null {
  if (!pb.authStore.isValid || !pb.authStore.record) return null;
  return pb.authStore.record as unknown as StaffRecord;
}
