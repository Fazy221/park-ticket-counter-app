// Boots a real, disposable PocketBase instance - actual binary, actual
// pb_hooks/, actual pb_migrations/ - so tests exercise the real JS hook
// code instead of a reimplementation of it.
//
// WHY NOT A MOCK / UNIT TEST: pb_hooks code only runs inside PocketBase's
// embedded JS VM (goja) and talks to Go-backed globals ($app, DynamicModel,
// Record, routerAdd, $apis...) that don't exist outside it. PocketBase's
// own maintainer's answer on this is direct: "Unit testing with the JS
// pb_hooks is not possible, unless you decide to mock every translated Go
// API... if you need tests my recommendation is to use Go [or] external
// integration testing... sending real requests to test PocketBase
// instances." This harness is that external-integration approach, just in
// Node instead of Go, since the rest of this project is already
// JS/TypeScript and Node is already a stated Prerequisite for local dev -
// no new language or toolchain to install.
//
// Each test run gets: a throwaway --dir (deleted after), pb_hooks/ and
// pb_migrations/ pointed straight at the real backend/ folder via
// --hooksDir/--migrationsDir (so there's no copy of the hooks that could
// drift from what actually ships), and a random free port so tests can
// run concurrently with a real dev server on 8090 without colliding.

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import net from "node:net";

const BACKEND_DIR = path.resolve(import.meta.dirname, "..", "..");
const SUPERUSER_EMAIL = "test-harness@example.com";
const SUPERUSER_PASSWORD = "test-harness-password-1234";

function resolvePocketBaseBinary() {
  if (process.env.POCKETBASE_BIN) return process.env.POCKETBASE_BIN;
  const exe = path.join(BACKEND_DIR, process.platform === "win32" ? "pocketbase.exe" : "pocketbase");
  if (existsSync(exe)) return exe;
  throw new Error(
    `Couldn't find a PocketBase binary at ${exe}. This test suite runs against a real PocketBase ` +
      `instance (see harness.mjs's top comment for why) - grab the matching version from PocketBase's ` +
      `releases page and place it in backend/ (same "not bundled, grab it separately" situation as ` +
      `running the app normally - see README's Prerequisites), or point POCKETBASE_BIN at wherever it lives.`
  );
}

// Ephemeral port from the OS rather than a hardcoded one, so this can run
// alongside a real dev server on 8090, or multiple test files at once,
// without a port clash. Small TOCTOU race (port could theoretically be
// grabbed between closing this probe socket and pocketbase binding it) -
// acceptable for a local test run, not something to over-engineer.
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitForHealth(baseUrl, { timeoutMs = 10000, intervalMs = 150 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`PocketBase never became healthy at ${baseUrl}/api/health within ${timeoutMs}ms: ${lastErr}`);
}

/**
 * Starts a fresh PocketBase instance with the real pb_hooks/pb_migrations,
 * returns an API helper plus a stop() to tear it down. Intended for one
 * `before()`/`after()` pair per test file, not per test case - booting
 * PocketBase takes real wall-clock time, and each test case should instead
 * use its own unique qr_code/username so fixtures don't collide.
 */
export async function startTestServer() {
  const pocketbaseBin = resolvePocketBaseBinary();
  const dataDir = mkdtempSync(path.join(tmpdir(), "gatemark-pb-test-"));
  const hooksDir = path.join(BACKEND_DIR, "pb_hooks");
  const migrationsDir = path.join(BACKEND_DIR, "pb_migrations");
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logPath = path.join(dataDir, "pocketbase-test.log");

  // Creating the superuser as its own step (rather than via the running
  // server's API) means the very first HTTP request this suite makes is
  // already an authenticated one - no bootstrap-order dependency on the
  // server having a default account.
  execFileSync(
    pocketbaseBin,
    ["superuser", "upsert", SUPERUSER_EMAIL, SUPERUSER_PASSWORD, "--dir", dataDir, "--migrationsDir", migrationsDir],
    { stdio: "pipe" }
  );

  const child = spawn(
    pocketbaseBin,
    [
      "serve",
      `--http=127.0.0.1:${port}`,
      "--dir",
      dataDir,
      "--hooksDir",
      hooksDir,
      "--migrationsDir",
      migrationsDir,
      "--hooksWatch=false", // no file-watch reload needed for a short-lived test process
    ],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  mkdirSync(dataDir, { recursive: true });
  child.stdout.on("data", (chunk) => appendFileSync(logPath, chunk));
  child.stderr.on("data", (chunk) => appendFileSync(logPath, chunk));

  let exitedEarly = null;
  child.on("exit", (code, signal) => {
    exitedEarly = { code, signal };
  });

  try {
    await waitForHealth(baseUrl);
  } catch (err) {
    if (exitedEarly) {
      throw new Error(
        `PocketBase process exited early (code=${exitedEarly.code}, signal=${exitedEarly.signal}) - see ${logPath} for its output.`
      );
    }
    throw new Error(`${err.message} - see ${logPath} for PocketBase's output.`);
  }

  // Superuser token, used by fixture helpers below (creating staff/counter
  // records - both createRule: null, i.e. superuser-only) but deliberately
  // NOT used by the actual test assertions, which should authenticate as
  // staff via /api/staff-login the same way a real device does.
  const authRes = await fetch(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identity: SUPERUSER_EMAIL, password: SUPERUSER_PASSWORD }),
  });
  if (!authRes.ok) {
    throw new Error(`Superuser auth failed (${authRes.status}): ${await authRes.text()}`);
  }
  const { token: superuserToken } = await authRes.json();

  async function asSuperuser(pathname, init = {}) {
    return fetch(`${baseUrl}${pathname}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        Authorization: superuserToken,
        ...(init.headers || {}),
      },
    });
  }

  /** Creates a staff fixture and returns { id, username, pin }. */
  async function createStaff({ name, role = "counter_staff", active = true, pin = "1234" }) {
    const username = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await asSuperuser("/api/collections/staff/records", {
      method: "POST",
      body: JSON.stringify({
        name,
        username,
        role,
        active,
        password: pin,
        passwordConfirm: pin,
      }),
    });
    if (!res.ok) throw new Error(`createStaff failed (${res.status}): ${await res.text()}`);
    const record = await res.json();
    return { id: record.id, username, pin };
  }

  /** Flips a staff record's `active` flag (e.g. to test a deactivated account). */
  async function setStaffActive(staffId, active) {
    const res = await asSuperuser(`/api/collections/staff/records/${staffId}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    });
    if (!res.ok) throw new Error(`setStaffActive failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  /** Creates a counter fixture and returns its record. */
  async function createCounter({ name = `Counter ${Math.random().toString(36).slice(2, 8)}`, active = true } = {}) {
    const res = await asSuperuser("/api/collections/counters/records", {
      method: "POST",
      body: JSON.stringify({ name, active }),
    });
    if (!res.ok) throw new Error(`createCounter failed (${res.status}): ${await res.text()}`);
    return res.json();
  }

  /** Logs in as staff the same way the mobile app does, returns the staff-scoped token. */
  async function staffLogin(username, pin) {
    const res = await fetch(`${baseUrl}/api/staff-login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, pin }),
    });
    return res; // let callers inspect status for both success and failure cases
  }

  /** Calls /api/redeem with a staff token. */
  async function redeem(staffToken, body) {
    return fetch(`${baseUrl}/api/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: staffToken },
      body: JSON.stringify(body),
    });
  }

  /** Fetches ticket_events rows for a ticket, for asserting on the audit trail. */
  async function getTicketEvents(ticketId) {
    // Sort by server_time, not created: per the README ("tickets, counters,
    // and staff have no created/updated fields"), ticket_events was also
    // defined via migration with an explicit fields list that never
    // included created/updated - server_time is the one real ordering
    // column here. Sorting by created returns a 400.
    const res = await asSuperuser(
      `/api/collections/ticket_events/records?filter=${encodeURIComponent(`ticket_id="${ticketId}"`)}&sort=server_time`
    );
    if (!res.ok) throw new Error(`getTicketEvents failed (${res.status}): ${await res.text()}`);
    const { items } = await res.json();
    return items;
  }

  function uniqueQrCode(label = "ticket") {
    return `${label}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async function stop() {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 2000); // don't hang the test run forever if the process is stubborn
    });
    rmSync(dataDir, { recursive: true, force: true });
  }

  return {
    baseUrl,
    logPath,
    createStaff,
    setStaffActive,
    createCounter,
    staffLogin,
    redeem,
    getTicketEvents,
    uniqueQrCode,
    stop,
  };
}
