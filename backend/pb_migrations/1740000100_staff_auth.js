/// <reference path="../pb_data/types.d.ts" />

// Converts `staff` from a plain base collection into a real PocketBase auth
// collection, so counter devices can log in with (name + PIN) and get back
// a token that /api/redeem, /api/undo-scan, and /api/session-log can check
// with $apis.requireAuth("staff") instead of accepting any superuser token.
//
// This is the step the previous migration explicitly deferred - see the
// comment on the old `pin_hash` field: "Replaced with a proper auth-
// collection password once staff login is built."
//
// WHY DELETE + RECREATE INSTEAD OF MUTATING IN PLACE:
// PocketBase collection docs/examples only ever show `type` set at creation
// (`new Collection({ type: "auth", ... })`); there's no documented path for
// flipping an existing saved collection's type from "base" to "auth". Doing
// that unsupported would risk silently corrupting the collection. Deleting
// and recreating is the operation PocketBase actually documents and
// supports, so that's what this does. Cost: any `staff` rows already
// created against the old base-collection schema (pin_hash, no password)
// are gone after this runs. That's fine here - the schema migration only
// just landed, so there's no real staff data to lose yet. If you've already
// seeded staff in a running instance, export those rows first.
//
// SECURITY NOTE, read before deploying: a 4-6 digit PIN as a PocketBase
// "password" is convenient for counter staff but is not a strong secret -
// there's no rate limiting on login attempts beyond PocketBase's defaults.
// Fine for a LAN-only counter app where the attacker would need to be on
// the local network already; worth revisiting if that assumption changes.
// The password field's minimum length below is relaxed to 4 to allow short
// PINs - PocketBase's default minimum is 8, which would reject them.
migrate((app) => {
  const oldStaff = app.findCollectionByNameOrId("staff");
  const tickets = app.findCollectionByNameOrId("tickets");
  const ticketEvents = app.findCollectionByNameOrId("ticket_events");

  // ---- 1. create the new auth collection under a temp name -------------
  const newStaff = new Collection({
    type: "auth",
    name: "staff_auth_tmp",
    // Nobody can list/view/create/update/delete staff records over the
    // regular Records API - all staff-facing access goes through the
    // custom /api/* routes in pb_hooks, which run with full privileges
    // and apply their own logic (e.g. "you can only see your own record").
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 100 },
      {
        name: "role",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["counter_staff", "superadmin"],
      },
      { name: "active", type: "bool" },
      // Login identity. Not shown to the customer, only used at the PIN
      // pad. Auto-derived from `name` at creation time by the superadmin
      // UI/route (see pb_hooks) - kept as a plain unique text field here.
      { name: "username", type: "text", required: true, max: 100 },
    ],
    passwordAuth: {
      enabled: true,
      identityFields: ["username"],
    },
    // Staff don't have email addresses - make the system email field
    // optional so records can be created without inventing fake ones.
    indexes: ["CREATE UNIQUE INDEX idx_staff_username ON staff_auth_tmp (username)"],
  });
  app.save(newStaff);

  // Relax the system password field's minimum length so short numeric
  // PINs are accepted (PocketBase's default min is 8), and make email
  // optional since staff don't have one.
  const pwField = newStaff.fields.getByName("password");
  if (pwField) pwField.min = 4;
  const emailField = newStaff.fields.getByName("email");
  if (emailField) emailField.required = false;
  app.save(newStaff);

  // ---- 2. repoint tickets.staff_id and ticket_events.actor_staff_id ----
  // at the new collection before the old one is deleted.
  //
  // NOTE: you can't just do `field.collectionId = newStaff.id; app.save(...)`
  // here - PocketBase treats a relation field's collectionId as immutable
  // once the field exists ("The relation collection cannot be changed").
  // And critically, removing + adding the field and THEN calling
  // app.save() ONCE doesn't dodge it either: PocketBase diffs the payload
  // against the DB by field NAME, so "old field staff_id -> collection A"
  // vs "new field staff_id -> collection B" still reads as an in-place
  // change even though the field objects/ids differ. The delete has to be
  // its own committed save before the add happens as a separate save.
  tickets.fields.removeByName("staff_id");
  app.save(tickets);

  ticketEvents.fields.removeByName("actor_staff_id");
  app.save(ticketEvents);

  tickets.fields.add(new Field({
    name: "staff_id",
    type: "relation",
    collectionId: newStaff.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  app.save(tickets);

  ticketEvents.fields.add(new Field({
    name: "actor_staff_id",
    type: "relation",
    collectionId: newStaff.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  app.save(ticketEvents);

  // ---- 3. drop the old base `staff` collection, then rename the new ----
  //         one into its place.
  app.delete(oldStaff);
  newStaff.name = "staff";
  app.save(newStaff);
}, (app) => {
  // Down: best-effort revert to a base collection shaped like the
  // original. Any staff/login data created under the auth collection is
  // lost - this is a schema rollback, not a data migration.
  const staff = app.findCollectionByNameOrId("staff");
  const tickets = app.findCollectionByNameOrId("tickets");
  const ticketEvents = app.findCollectionByNameOrId("ticket_events");

  const restored = new Collection({
    type: "base",
    name: "staff_base_tmp",
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { name: "name", type: "text", required: true, max: 100 },
      {
        name: "role",
        type: "select",
        required: true,
        maxSelect: 1,
        values: ["counter_staff", "superadmin"],
      },
      { name: "pin_hash", type: "text", required: true },
      { name: "active", type: "bool" },
    ],
  });
  app.save(restored);

  tickets.fields.removeByName("staff_id");
  tickets.fields.add(new Field({
    name: "staff_id",
    type: "relation",
    collectionId: restored.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  app.save(tickets);

  ticketEvents.fields.removeByName("actor_staff_id");
  ticketEvents.fields.add(new Field({
    name: "actor_staff_id",
    type: "relation",
    collectionId: restored.id,
    maxSelect: 1,
    cascadeDelete: false,
  }));
  app.save(ticketEvents);

  app.delete(staff);
  restored.name = "staff";
  app.save(restored);
});
