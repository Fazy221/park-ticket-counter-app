import * as SecureStore from "expo-secure-store";

// WHY THIS EXISTS: this is a shared counter kiosk, not a personal phone.
// Staff PIN in and out across a shift, and the offline queue can easily
// hold scans from more than one staff member by the time the device
// reconnects (loadshedding doesn't wait for a shift change to end). If the
// sync loop authenticated every queued scan as "whoever's logged in right
// now", a scan queued by Staff A but synced after Staff B has logged in
// would get written to the audit trail as Staff B's - exactly the kind of
// silent misattribution the staff/PIN system exists to prevent.
//
// So instead of one shared session, this keeps a small SecureStore-backed
// cache of {staffId -> token} for every staff member who has ever logged
// into this device, plus a pointer to whichever one is "active" right now
// for the UI. Logging out clears the active pointer but NOT the cached
// tokens - they're needed to drain the queue after the person who made
// those scans has clocked out. A token only disappears when this device's
// full cache is explicitly wiped (Settings > Forget this device) or the
// server invalidates it (staff deactivated, password/PIN changed).
//
// Tokens are bearer credentials, so they live in SecureStore
// (Keychain/Keystore-backed), never AsyncStorage.

// SecureStore keys may only contain alphanumerics, ".", "-", and "_" - no
// colons - so this can't use the "gatemark:token:<id>" style used
// elsewhere (AsyncStorage, which has no such restriction).
const TOKEN_PREFIX = "gatemark.token."; // + staffId
const ACTIVE_STAFF_KEY = "gatemark.activeStaffId";
const STAFF_META_KEY = "gatemark.staffMeta"; // small JSON blob, id -> {name, role}

type StaffMeta = { name: string; role: "counter_staff" | "superadmin" };

export async function cacheStaffToken(
  staffId: string,
  token: string,
  meta: StaffMeta
): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_PREFIX + staffId, token);
  const metaMap = await getMetaMap();
  metaMap[staffId] = meta;
  await SecureStore.setItemAsync(STAFF_META_KEY, JSON.stringify(metaMap));
}

export async function getStaffToken(staffId: string): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_PREFIX + staffId);
}

export async function getStaffMeta(staffId: string): Promise<StaffMeta | null> {
  const metaMap = await getMetaMap();
  return metaMap[staffId] ?? null;
}

async function getMetaMap(): Promise<Record<string, StaffMeta>> {
  const raw = await SecureStore.getItemAsync(STAFF_META_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function setActiveStaffId(staffId: string | null): Promise<void> {
  if (staffId) {
    await SecureStore.setItemAsync(ACTIVE_STAFF_KEY, staffId);
  } else {
    await SecureStore.deleteItemAsync(ACTIVE_STAFF_KEY);
  }
}

export async function getActiveStaffId(): Promise<string | null> {
  return SecureStore.getItemAsync(ACTIVE_STAFF_KEY);
}

// "Forget this device" - Settings screen only, wipes every cached token.
// Refuses silently if there's a reason not to; the caller (Settings
// screen) is responsible for warning about unsynced scans first.
export async function forgetAllStaffTokens(): Promise<void> {
  const metaMap = await getMetaMap();
  await Promise.all(Object.keys(metaMap).map((id) => SecureStore.deleteItemAsync(TOKEN_PREFIX + id)));
  await SecureStore.deleteItemAsync(STAFF_META_KEY);
  await SecureStore.deleteItemAsync(ACTIVE_STAFF_KEY);
}
