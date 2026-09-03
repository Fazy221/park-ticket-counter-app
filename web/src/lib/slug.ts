// "Auto-derived from name at creation time by the superadmin UI" - see the
// comment on the username field in 1740000100_staff_auth.js. Lowercases,
// strips anything that isn't a letter/digit, collapses whitespace to a
// single dot. Not guaranteed unique - the server's unique index on
// username is still the real check; a collision just surfaces as an
// ordinary create error the form displays (see StaffFormDialog).
export function slugifyUsername(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, ".");
}
