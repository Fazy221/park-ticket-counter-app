import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers/harness.mjs";

// One real PocketBase instance for this whole file (booting it has real
// wall-clock cost - see harness.mjs). Every test below uses its own
// qr_code/idempotency_key/username so fixtures never collide.
let server;
let counter;

before(async () => {
  server = await startTestServer();
  counter = await server.createCounter({ name: "Front Gate" });
});

after(async () => {
  await server.stop();
});

/** Logs a fresh staff member in and returns their token. */
async function loginNewStaff(name, opts = {}) {
  const staff = await server.createStaff({ name, ...opts });
  const res = await server.staffLogin(staff.username, staff.pin);
  assert.equal(res.status, 200, `staff-login failed for ${name}`);
  const { token } = await res.json();
  return { staff, token };
}

describe("first scan of an unknown code is that ticket's creation event", () => {
  test("creates the ticket and redeems it in the same request", async () => {
    const { staff, token } = await loginNewStaff("Alice");
    const qr = server.uniqueQrCode();

    const res = await server.redeem(token, {
      qr_code: qr,
      counter_id: counter.id,
      idempotency_key: server.uniqueQrCode("key"),
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    // The response's "status" is "valid" for a successful redemption -
    // it's the outcome of the scan, not the ticket's stored status
    // (which is already "redeemed" by the time this returns).
    assert.equal(body.status, "valid");
    assert.equal(typeof body.ticket_id, "string");
    assert.equal(typeof body.assigned_number, "number");
    assert.ok(body.assigned_number >= 1);
    assert.equal(typeof body.scanned_at, "string");

    // Exactly one audit row, logged as a first-time "scanned" - not a
    // separate "created" event, since creation and redemption are the
    // same event here.
    const events = await server.getTicketEvents(body.ticket_id);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, "scanned");
    assert.equal(events[0].actor_staff_id, staff.id);
    assert.equal(events[0].counter_id, counter.id);
  });

  test("assigned_number is sequential across tickets, not per-ticket", async () => {
    const { token } = await loginNewStaff("Bob");
    const first = await (
      await server.redeem(token, {
        qr_code: server.uniqueQrCode(),
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      })
    ).json();
    const second = await (
      await server.redeem(token, {
        qr_code: server.uniqueQrCode(),
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      })
    ).json();
    assert.equal(second.assigned_number, first.assigned_number + 1);
  });
});

describe("conflict vs. ordinary duplicate", () => {
  test("re-scanning an already-redeemed ticket live is an ordinary duplicate_attempt", async () => {
    const { staff: firstStaff, token: firstToken } = await loginNewStaff("Carol");
    const { staff: secondStaff, token: secondToken } = await loginNewStaff("Dave");
    const qr = server.uniqueQrCode();

    const first = await (
      await server.redeem(firstToken, {
        qr_code: qr,
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      })
    ).json();

    const dupRes = await server.redeem(secondToken, {
      qr_code: qr,
      counter_id: counter.id,
      idempotency_key: server.uniqueQrCode("key"),
      // was_queued_offline is deliberately omitted/false: this is a live
      // rejection, not a device that was ever stuck "Pending sync".
    });
    const dup = await dupRes.json();

    assert.equal(dupRes.status, 200);
    assert.equal(dup.status, "redeemed");
    assert.equal(dup.ticket_id, first.ticket_id);
    assert.equal(dup.assigned_number, first.assigned_number);
    assert.equal(dup.original_staff_id, firstStaff.id);
    assert.equal(dup.original_counter_id, counter.id);
    assert.equal(dup.conflict, false);

    const events = await server.getTicketEvents(first.ticket_id);
    assert.equal(events.length, 2);
    assert.equal(events[0].event_type, "scanned");
    assert.equal(events[1].event_type, "duplicate_attempt");
    assert.equal(events[1].actor_staff_id, secondStaff.id);
    // Ordinary duplicates don't get the conflict explanation note.
    assert.equal(events[1].note, "");
  });

  test("a scan that was queued offline and lost the race is a conflict_flagged, not a duplicate_attempt", async () => {
    const { token: firstToken } = await loginNewStaff("Erin");
    const { token: secondToken } = await loginNewStaff("Frank");
    const qr = server.uniqueQrCode();

    const first = await (
      await server.redeem(firstToken, {
        qr_code: qr,
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      })
    ).json();

    const conflictRes = await server.redeem(secondToken, {
      qr_code: qr,
      counter_id: counter.id,
      idempotency_key: server.uniqueQrCode("key"),
      was_queued_offline: true,
    });
    const conflict = await conflictRes.json();

    assert.equal(conflictRes.status, 200);
    assert.equal(conflict.status, "redeemed");
    assert.equal(conflict.ticket_id, first.ticket_id);
    assert.equal(conflict.conflict, true);

    const events = await server.getTicketEvents(first.ticket_id);
    assert.equal(events.length, 2);
    assert.equal(events[1].event_type, "conflict_flagged");
    // Conflicts get the explanatory note; ordinary duplicates don't (see
    // previous test) - this is the one behavioral difference in the audit
    // trail between the two branches, worth pinning down explicitly.
    assert.ok(events[1].note.length > 0);
    assert.match(events[1].note, /offline/i);
  });

  test("re-scanning a voided ticket reports status 'void', still distinguishing conflict from duplicate", async () => {
    const { token: firstToken } = await loginNewStaff("Grace");
    const { token: secondToken } = await loginNewStaff("Heidi");
    const { token: adminToken } = await loginNewStaff("AdminForVoid", { role: "superadmin" });
    const qr = server.uniqueQrCode();

    const first = await (
      await server.redeem(firstToken, {
        qr_code: qr,
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      })
    ).json();

    const voidRes = await fetch(`${server.baseUrl}/api/ticket-override`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: adminToken },
      body: JSON.stringify({ ticket_id: first.ticket_id, action: "void", note: "Refunded" }),
    });
    assert.equal(voidRes.status, 200, await voidRes.text());

    const dupRes = await server.redeem(secondToken, {
      qr_code: qr,
      counter_id: counter.id,
      idempotency_key: server.uniqueQrCode("key"),
    });
    const dup = await dupRes.json();

    assert.equal(dup.status, "void");
    assert.equal(dup.conflict, false);
  });
});

describe("idempotency key replay", () => {
  test("resending the same key replays the cached result instead of re-deriving one", async () => {
    const { token } = await loginNewStaff("Ivan");
    const qr = server.uniqueQrCode();
    const key = server.uniqueQrCode("key");
    const payload = { qr_code: qr, counter_id: counter.id, idempotency_key: key };

    const firstRes = await server.redeem(token, payload);
    const first = await firstRes.json();
    assert.equal(firstRes.status, 200);
    assert.equal(first.status, "valid");

    // Same key, same body - simulates the phone retrying because it never
    // saw the first response (e.g. the connection dropped after commit).
    const replayRes = await server.redeem(token, payload);
    const replay = await replayRes.json();
    assert.equal(replayRes.status, 200);
    assert.deepEqual(replay, first);

    // The replay must not have touched anything else: still exactly one
    // audit row, not two "scanned" events for one ticket.
    const events = await server.getTicketEvents(first.ticket_id);
    assert.equal(events.length, 1);
  });

  test("replaying a duplicate-branch key doesn't log a second duplicate_attempt", async () => {
    const { token: firstToken } = await loginNewStaff("Judy");
    const { token: secondToken } = await loginNewStaff("Kevin");
    const qr = server.uniqueQrCode();
    const dupKey = server.uniqueQrCode("key");

    const first = await (
      await server.redeem(firstToken, {
        qr_code: qr,
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      })
    ).json();

    const dupRes = await server.redeem(secondToken, {
      qr_code: qr,
      counter_id: counter.id,
      idempotency_key: dupKey,
    });
    const dup = await dupRes.json();
    assert.equal(dup.status, "redeemed");

    const replayRes = await server.redeem(secondToken, {
      qr_code: qr,
      counter_id: counter.id,
      idempotency_key: dupKey,
    });
    const replay = await replayRes.json();
    assert.deepEqual(replay, dup);

    const events = await server.getTicketEvents(first.ticket_id);
    // scanned + duplicate_attempt only - the replay added nothing.
    assert.equal(events.length, 2);
  });

  test("an undo between the original commit and a retry doesn't leak into the replay", async () => {
    // Directly exercises the comment in redeem.pb.js: a cached result is
    // replayed "rather than re-deriving an answer from current ticket
    // state (which may have moved on since - e.g. an undo in between)".
    const { staff, token } = await loginNewStaff("Larry");
    const qr = server.uniqueQrCode();
    const key = server.uniqueQrCode("key");

    const first = await (
      await server.redeem(token, { qr_code: qr, counter_id: counter.id, idempotency_key: key })
    ).json();

    const undoRes = await fetch(`${server.baseUrl}/api/undo-scan`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: token },
      body: JSON.stringify({ ticket_id: first.ticket_id }),
    });
    assert.equal(undoRes.status, 200, await undoRes.text());

    // Retry the exact same scan attempt after the undo. It must replay the
    // ORIGINAL result (status "valid", the original assigned_number), not
    // re-run the redemption branch against the now-reopened ticket.
    const replayRes = await server.redeem(token, { qr_code: qr, counter_id: counter.id, idempotency_key: key });
    const replay = await replayRes.json();
    assert.deepEqual(replay, first);
    void staff;
  });
});

describe("single-writer transaction guarantee", () => {
  test("two concurrent live scans of a brand-new code never both create/win - one valid, one duplicate, one ticket", async () => {
    const { token: tokenA } = await loginNewStaff("DeviceA");
    const { token: tokenB } = await loginNewStaff("DeviceB");
    const qr = server.uniqueQrCode();

    // Fired together on purpose: this is the "two devices scan a brand-new
    // code at the same instant" race described in the README. Both
    // requests reach the server before either has committed.
    const [resA, resB] = await Promise.all([
      server.redeem(tokenA, {
        qr_code: qr,
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      }),
      server.redeem(tokenB, {
        qr_code: qr,
        counter_id: counter.id,
        idempotency_key: server.uniqueQrCode("key"),
      }),
    ]);
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

    const outcomes = [bodyA, bodyB];
    const winners = outcomes.filter((o) => o.status === "valid");
    const losers = outcomes.filter((o) => o.status === "redeemed");
    assert.equal(winners.length, 1, `expected exactly one winner, got ${JSON.stringify(outcomes)}`);
    assert.equal(losers.length, 1);
    // Both requests must have resolved to the SAME ticket - no second
    // ticket record was ever created for this qr_code.
    assert.equal(losers[0].ticket_id, winners[0].ticket_id);
    assert.equal(losers[0].assigned_number, winners[0].assigned_number);

    const events = await server.getTicketEvents(winners[0].ticket_id);
    assert.equal(events.length, 2);
    const types = events.map((e) => e.event_type).sort();
    assert.deepEqual(types, ["duplicate_attempt", "scanned"]);
  });

  test("N concurrent scans of the same brand-new code still produce exactly one ticket and one winner", async () => {
    const N = 8;
    const tokens = await Promise.all(
      Array.from({ length: N }, (_, i) => loginNewStaff(`Concurrent${i}-${server.uniqueQrCode()}`))
    );
    const qr = server.uniqueQrCode();

    const responses = await Promise.all(
      tokens.map(({ token }) =>
        server.redeem(token, {
          qr_code: qr,
          counter_id: counter.id,
          idempotency_key: server.uniqueQrCode("key"),
        })
      )
    );
    const bodies = await Promise.all(responses.map((r) => r.json()));

    const ticketIds = new Set(bodies.map((b) => b.ticket_id));
    assert.equal(ticketIds.size, 1, "all N scans must resolve to the same single ticket");

    const winners = bodies.filter((b) => b.status === "valid");
    assert.equal(winners.length, 1, `expected exactly 1 winner out of ${N}, got ${winners.length}`);

    const events = await server.getTicketEvents([...ticketIds][0]);
    assert.equal(events.length, N);
    assert.equal(events.filter((e) => e.event_type === "scanned").length, 1);
    assert.equal(events.filter((e) => e.event_type === "duplicate_attempt").length, N - 1);
  });

  test("two concurrent requests with the SAME idempotency key still produce only one scanned event", async () => {
    // Different flavor of race: not two different scan attempts, but one
    // attempt whose request got sent twice concurrently (e.g. a flaky
    // connection triggering a client-side double-send of the same retry).
    const { token } = await loginNewStaff("DoubleSend");
    const qr = server.uniqueQrCode();
    const key = server.uniqueQrCode("key");
    const payload = { qr_code: qr, counter_id: counter.id, idempotency_key: key };

    const [resA, resB] = await Promise.all([server.redeem(token, payload), server.redeem(token, payload)]);
    const [bodyA, bodyB] = await Promise.all([resA.json(), resB.json()]);

    assert.deepEqual(bodyA, bodyB);
    assert.equal(bodyA.status, "valid");

    const events = await server.getTicketEvents(bodyA.ticket_id);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, "scanned");
  });
});

describe("validation and auth edge cases", () => {
  test("missing required fields is rejected before touching the transaction", async () => {
    const { token } = await loginNewStaff("Missy");
    const res = await server.redeem(token, { counter_id: counter.id, idempotency_key: "x" });
    assert.equal(res.status, 400);
  });

  test("idempotency_key over 100 chars is rejected", async () => {
    const { token } = await loginNewStaff("Nancy");
    const res = await server.redeem(token, {
      qr_code: server.uniqueQrCode(),
      counter_id: counter.id,
      idempotency_key: "x".repeat(101),
    });
    assert.equal(res.status, 400);
  });

  test("unknown counter_id is rejected", async () => {
    const { token } = await loginNewStaff("Oscar");
    const res = await server.redeem(token, {
      qr_code: server.uniqueQrCode(),
      counter_id: "nonexistent123",
      idempotency_key: server.uniqueQrCode("key"),
    });
    assert.equal(res.status, 400);
  });

  test("inactive counter is rejected", async () => {
    const inactiveCounter = await server.createCounter({ active: false });
    const { token } = await loginNewStaff("Peggy");
    const res = await server.redeem(token, {
      qr_code: server.uniqueQrCode(),
      counter_id: inactiveCounter.id,
      idempotency_key: server.uniqueQrCode("key"),
    });
    assert.equal(res.status, 400);
  });

  test("a deactivated staff member's existing token is rejected on the next request", async () => {
    const { staff, token } = await loginNewStaff("Quentin");

    // Sanity check the token works before deactivating.
    const beforeRes = await server.redeem(token, {
      qr_code: server.uniqueQrCode(),
      counter_id: counter.id,
      idempotency_key: server.uniqueQrCode("key"),
    });
    assert.equal(beforeRes.status, 200);

    // Deactivate after the token was already issued - the token itself is
    // still structurally valid, so this only works if redeem.pb.js
    // actually re-checks `active` per-request rather than trusting
    // whatever was true at login time.
    await server.setStaffActive(staff.id, false);

    const afterRes = await server.redeem(token, {
      qr_code: server.uniqueQrCode(),
      counter_id: counter.id,
      idempotency_key: server.uniqueQrCode("key"),
    });
    assert.equal(afterRes.status, 403);
  });

  test("missing auth token is rejected", async () => {
    const res = await server.redeem("", {
      qr_code: server.uniqueQrCode(),
      counter_id: counter.id,
      idempotency_key: server.uniqueQrCode("key"),
    });
    assert.equal(res.status, 401);
  });
});
