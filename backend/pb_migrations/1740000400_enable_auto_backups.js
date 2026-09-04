/// <reference path="../pb_data/types.d.ts" />

// Deployment hardening item 2: "No backup exists." Turns on PocketBase's
// built-in cron backup feature (app.settings().backups), which was
// present but never enabled anywhere in pb_hooks/ or pb_migrations/ - see
// the action plan near the top of README.md.
//
// This is the app-level half of the fix only. What this migration turns
// on writes a full zip of pb_data (the SQLite file + uploaded files) into
// pb_data/backups/ on the schedule below, on the SAME laptop and SAME
// disk as the live database. That's real protection against the
// "database got corrupted" / "someone fat-fingered a bulk delete" class
// of problem, but it does nothing for the "spilled coffee, theft, or
// dead disk" class - the whole laptop and everything on it is still a
// single point of failure. Getting a copy of pb_data/backups/ off the
// laptop (USB drive, network share, cloud-sync folder - anything, on
// whatever cadence someone remembers) is still a separate, manual step;
// see backend/backup-offsite.ps1 and "Automatic backups (deployment
// hardening item 2)" further down in README.md for that half.
//
// Schedule: once a day at 4am local time - this app is a single-venue,
// event-driven system, so the middle of the night is about as safe a bet
// as exists for "nobody's mid-scan right now," without needing to know
// this particular venue's actual hours. cronMaxKeep: 14 keeps two weeks
// of daily snapshots. A GateMark pb_data is just SQLite rows (no large
// uploaded files anywhere in this schema), so 14 zips of that is
// negligible disk cost next to the value of a two-week recovery window.
migrate((app) => {
  const settings = app.settings();
  settings.backups.cron = "0 4 * * *";
  settings.backups.cronMaxKeep = 14;
  app.save(settings);
}, (app) => {
  const settings = app.settings();
  settings.backups.cron = "";
  settings.backups.cronMaxKeep = 0;
  app.save(settings);
});
