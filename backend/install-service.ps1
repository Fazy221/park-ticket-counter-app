<#
.SYNOPSIS
  Installs (or removes) GateMark's PocketBase backend as a Windows
  service that starts automatically at boot and restarts itself if it
  crashes - deployment hardening item 3 ("nothing restarts PocketBase
  if it stops").

.DESCRIPTION
  pocketbase.exe is a plain console application - it doesn't implement
  the Windows Service Control Manager protocol, so `sc.exe create`
  pointed straight at it won't work (the SCM just times out waiting for
  a service-start acknowledgement it never sends). This script uses NSSM
  (https://nssm.cc - "the Non-Sucking Service Manager") as a thin
  wrapper instead: NSSM registers itself as the actual Windows service,
  launches pocketbase.exe as a child process, and relaunches it
  automatically if that child ever exits. That covers both failure
  modes item 3 is about - "laptop rebooted" (the service starts on its
  own, no login required - it runs as LocalSystem, unlike a Scheduled
  Task set to "run whether user is logged on or not," which needs a
  stored account password) and "PocketBase itself crashed mid-shift"
  (NSSM notices the child process exited and restarts it, no reboot
  needed at all).

  **The one setting that matters most here is AppDirectory.** README.md's
  "Running it locally" section already documents that PocketBase only
  auto-applies pb_migrations/ and pb_hooks/ that sit next to its own
  *working directory*, not next to the binary - get this wrong under
  NSSM the same way it's wrong double-clicking pocketbase.exe from the
  wrong folder, and the service comes up "successfully" with a bare
  `users` collection and none of this app's schema, silently. This
  script always sets AppDirectory to its own folder ($PSScriptRoot), not
  wherever it happens to be invoked from, specifically to avoid that.

  NSSM itself is a small third-party .exe, not something PocketBase or
  Windows ships with - same "grab it separately, it's not in the AI zip"
  situation as pocketbase.exe (see README's Prerequisites). Download the
  matching build (usually win64) from https://nssm.cc/download and drop
  nssm.exe into this folder (backend/) before running this script, or
  pass -NssmPath to point at wherever it actually lives.

.PARAMETER ServiceName
  Windows service name to install under. Defaults to "GateMarkServer".

.PARAMETER Port
  Port PocketBase should bind to on 0.0.0.0, so LAN devices can reach it
  - same as the manual `--http=0.0.0.0:8090` in README's "Running it
  locally". Defaults to 8090.

.PARAMETER PocketBasePath
  Full path to pocketbase.exe. Defaults to pocketbase.exe next to this
  script.

.PARAMETER NssmPath
  Full path to nssm.exe. Defaults to nssm.exe next to this script.

.PARAMETER Uninstall
  Stops and removes the service instead of installing it. Does not
  touch pb_data/ or any backups - only the service registration itself.

.EXAMPLE
  # One-time on-site setup, run as Administrator
  .\install-service.ps1

.EXAMPLE
  # Different port, or an nssm.exe that lives somewhere else
  .\install-service.ps1 -Port 8091 -NssmPath "C:\tools\nssm-2.24\win64\nssm.exe"

.EXAMPLE
  # Undo it
  .\install-service.ps1 -Uninstall
#>

param(
  [string]$ServiceName = "GateMarkServer",
  [int]$Port = 8090,
  [string]$PocketBasePath,
  [string]$NssmPath,
  [switch]$Uninstall
)

$ErrorActionPreference = "Stop"

# Resolve everything relative to this script's own location, not the
# caller's cwd - same reasoning as backup-offsite.ps1's $PSScriptRoot use,
# and the exact gotcha this script exists to avoid for PocketBase itself.
$backendDir = $PSScriptRoot

if (-not $PocketBasePath) { $PocketBasePath = Join-Path $backendDir "pocketbase.exe" }
if (-not $NssmPath) { $NssmPath = Join-Path $backendDir "nssm.exe" }

function Assert-Admin {
  $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    throw "This script installs/removes a Windows service - it must be run from an elevated (Run as Administrator) PowerShell prompt."
  }
}

Assert-Admin

if ($Uninstall) {
  $existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
  if (-not $existing) {
    Write-Host "No '$ServiceName' service found - nothing to remove."
    exit 0
  }
  if (-not (Test-Path $NssmPath)) {
    throw "nssm.exe not found at $NssmPath - it's needed to cleanly remove a service it installed. Pass -NssmPath if it's not in backend/."
  }
  Write-Host "Stopping and removing '$ServiceName'..."
  & $NssmPath stop $ServiceName 2>$null | Out-Null
  Start-Sleep -Seconds 2
  & $NssmPath remove $ServiceName confirm | Out-Null
  Write-Host "Service removed. pb_data/ and everything in it is untouched."
  exit 0
}

if (-not (Test-Path $PocketBasePath)) {
  throw "pocketbase.exe not found at $PocketBasePath - grab it from PocketBase's releases page and place it in backend/ first (see README's Prerequisites)."
}
if (-not (Test-Path $NssmPath)) {
  throw "nssm.exe not found at $NssmPath - download it from https://nssm.cc/download and place it in backend/ (or pass -NssmPath). It's deliberately excluded from the AI-upload zip, same as pocketbase.exe."
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  Write-Host "'$ServiceName' already exists - removing it first so this run is a clean (re)install..."
  & $NssmPath stop $ServiceName 2>$null | Out-Null
  Start-Sleep -Seconds 2
  & $NssmPath remove $ServiceName confirm | Out-Null
}

Write-Host "If a manually-started pocketbase.exe (e.g. from the 'Running it locally' Terminal 1 instructions) is still running, stop it now (Ctrl+C in its terminal) - it's already holding port $Port and the service will fail to bind otherwise."
Write-Host ""

& $NssmPath install $ServiceName $PocketBasePath "serve --http=0.0.0.0:$Port"

# The setting that must not be left at NSSM's own default (nssm.exe's
# own folder) - see .DESCRIPTION above.
& $NssmPath set $ServiceName AppDirectory $backendDir

# Restart-on-crash: NSSM's default AppExit action is already "Restart",
# this just makes it explicit and adds a short delay so a fast crash
# loop doesn't spin the CPU pegging restart attempts every few ms.
& $NssmPath set $ServiceName AppExit Default Restart
& $NssmPath set $ServiceName AppRestartDelay 5000

# Start at boot, no login required - runs as LocalSystem (NSSM's default
# ObjectName). This is the actual advantage over a plain Scheduled Task
# here: no account password to store, no "run whether user is logged on
# or not" checkbox to get right, and it also survives a user logging out.
& $NssmPath set $ServiceName Start SERVICE_AUTO_START

# Capture stdout/stderr - PocketBase's own logs live in its SQLite _logs
# collection once it's up, but a Go panic before that initializes only
# ever shows up on the console, which nothing sees on an unattended
# service. Rotate so this can't grow unbounded over weeks of uptime.
$logPath = Join-Path $backendDir "pocketbase-service.log"
& $NssmPath set $ServiceName AppStdout $logPath
& $NssmPath set $ServiceName AppStderr $logPath
& $NssmPath set $ServiceName AppRotateFiles 1
& $NssmPath set $ServiceName AppRotateOnline 1
& $NssmPath set $ServiceName AppRotateBytes 10485760

& $NssmPath start $ServiceName
Start-Sleep -Seconds 2
$status = & $NssmPath status $ServiceName

Write-Host ""
Write-Host "Service '$ServiceName' status: $status"
Write-Host "Verify with: Get-Service $ServiceName -or- browse http://127.0.0.1:$Port/api/health"
Write-Host "Logs (stdout/stderr): $logPath"
