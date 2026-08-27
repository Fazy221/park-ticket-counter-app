/// <reference path="../pb_data/types.d.ts" />

// POST /api/staff-login
// body: { username, pin }
//
// Wraps PocketBase's built-in password auth for the `staff` collection
// (see 1740000100_staff_auth.js) in the app's own vocabulary - "pin" in,
// same token shape out - and adds the deactivated-account check that a
// bare `pb.collection('staff').authWithPassword()` call wouldn't give us
// for free. Follows PocketBase's documented custom-login-route pattern
// (find by identity field, validatePassword, apis.recordAuthResponse)
// rather than reimplementing token issuance by hand.
routerAdd("POST", "/api/staff-login", (e) => {
  const data = new DynamicModel({ username: "", pin: "" });
  e.bindBody(data);

  if (!data.username || !data.pin) {
    throw new BadRequestError("username and pin are required");
  }

  // findFirstRecordByData throws if nothing matches (same as the other
  // Find* helpers) rather than returning null, so this needs a try/catch -
  // caught the same generic way as a wrong PIN, so a bad username doesn't
  // reveal whether the account exists.
  let record;
  try {
    record = $app.findFirstRecordByData("staff", "username", data.username);
  } catch (err) {
    throw new BadRequestError("Invalid username or PIN");
  }

  if (!record.validatePassword(data.pin)) {
    throw new BadRequestError("Invalid username or PIN");
  }

  if (!record.getBool("active")) {
    throw new ForbiddenError("This staff account has been deactivated");
  }

  return $apis.recordAuthResponse(e, record, "password");
});
