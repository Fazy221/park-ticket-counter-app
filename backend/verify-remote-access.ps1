<#
.SYNOPSIS
  Checks that the on-site remote-access tool is actually configured to
  survive a reboot - deployment hardening item 5 ("remote-access
  software needs to survive a reboot, not just the initial install").

.DESCRIPTION
  There's no install script here the way item 3 has install-service.ps1
  for PocketBase - RustDesk (see README's "Remote access surviving
  reboot" section for why RustDesk specifically) already speaks the
  Windows Service Control Manager protocol natively, so clicking
  "Install to System" in its own UI is the entire "survive a reboot"
  fix, with nothing left for a script to wrap the way NSSM wraps
  pocketbase.exe.

  What's easy to get wrong on-site isn't the click itself, it's
  *believing* the click landed when it didn't. The RustDesk window
  looking normal tells you nothing about whether the service is
  actually registered, set to start automatically, or currently
  running - none of those three imply either of the others (a service
  can be registered but set to Manual start, or set to Automatic but
  crashed and sitting Stopped). This script asks the Service Control
  Manager directly for all three, the same "ask the SCM, not the app"
  approach install-service.ps1's own suggested verification
  (`Get-Service GateMarkServer`) uses for PocketBase.

  What this script deliberately does NOT check: whether a permanent
  password / unattended access is actually configured in RustDesk's
  Settings -> Security. That lives in a config file whose whole point
  is holding a password hash, and "is a password configured" isn't the
  same question as "will this survive a reboot" anyway - conflating the
  two would mean either parsing a credentials file this script has no
  business touching, or giving a false sense of completeness. Confirm
  that part by eye, once, on site.

.PARAMETER ServiceName
  Windows service name to check. Defaults to "RustDesk" - the name
  RustDesk's own installer registers itself under. Pass a different
  value only if a different remote-access tool ended up installed
  instead of the one recommended in README.md.

.EXAMPLE
  # Normal check, after initial setup or after an on-site reboot test
  .\verify-remote-access.ps1

.EXAMPLE
  # Checking a different tool than the one this project recommends
  .\verify-remote-access.ps1 -ServiceName "TeamViewer"
#>

param(
  [string]$ServiceName = "RustDesk"
)

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if (-not $service) {
  Write-Host "FAIL: no '$ServiceName' service is registered with Windows." -ForegroundColor Red
  Write-Host ""
  Write-Host "This is what you'd see if RustDesk is only installed in plain 'run the .exe' mode - it can look completely normal, connect fine right now, and still not survive a reboot, because nothing told Windows' Service Control Manager it exists."
  Write-Host "Fix: open RustDesk on this machine and use its 'Install to System' option (exact wording varies by version - it's usually on the main screen or under Settings), or run 'rustdesk.exe --install' from an elevated prompt. Re-run this check afterward."
  exit 1
}

# .StartType and .Status come straight from the SCM (same data
# `sc.exe qc` / `sc.exe query` would show), not from anything RustDesk
# itself reports about its own state.
$startType = $service.StartType
$status = $service.Status

Write-Host "Service '$ServiceName' found: Status=$status, StartType=$startType"
Write-Host ""

$problems = @()

if ($startType -ne "Automatic") {
  $problems += "StartType is '$startType', not 'Automatic' - it will NOT come back on its own after a reboot. Fix (elevated PowerShell): Set-Service -Name '$ServiceName' -StartupType Automatic"
}

if ($status -ne "Running") {
  $problems += "Status is '$status', not 'Running' right now. If StartType is already Automatic this may just mean it hasn't been started since the setting changed - try: Start-Service -Name '$ServiceName'"
}

if ($problems.Count -eq 0) {
  Write-Host "PASS: '$ServiceName' is registered, set to auto-start, and currently running." -ForegroundColor Green
  Write-Host ""
  Write-Host "One thing this script can't check - confirm by eye, once: open RustDesk -> Settings -> Security -> Unattended Access and make sure a permanent password is actually set there, not just the rotating one-time code shown on the main screen. Without that, someone still has to physically click 'Allow' at the laptop for every remote connection."
  exit 0
} else {
  foreach ($p in $problems) {
    Write-Host "FAIL: $p" -ForegroundColor Red
    Write-Host ""
  }
  exit 1
}
