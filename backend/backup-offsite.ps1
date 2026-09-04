<#
.SYNOPSIS
  Copies GateMark's local PocketBase backups (created by the cron job
  enabled in 1740000400_enable_auto_backups.js) somewhere off this laptop.

.DESCRIPTION
  Deployment hardening item 2, offsite half. The cron backup PocketBase
  runs on its own only ever writes into pb_data\backups on the SAME disk
  as the live database - fine for corruption/accidental-delete recovery,
  useless if the laptop itself is lost, stolen, or damaged. This script
  is the "get a copy somewhere else" step, meant to run unattended on a
  schedule (see setup below), same spirit as the Windows Scheduled Task
  described for item 3 in README.md.

  -Destination can be anything with a normal filesystem path: a USB
  drive letter, a mapped network share, a local folder synced by
  whatever cloud tool (OneDrive/Dropbox/etc.) someone already has
  running on the laptop. Deliberately not wired to any specific cloud
  provider's API - that would add a real internet dependency to a system
  whose whole design point is not needing one (see "Origin & architecture"
  in README.md). Point it at a synced folder if that's what's available
  on-site; the sync tool does the "off this laptop" part on its own time.

.PARAMETER Destination
  Folder to copy backup zips into. Created if it doesn't exist. If it's
  unreachable (USB unplugged, share offline), the script logs that and
  exits non-zero rather than throwing - a missing USB stick on a given
  night shouldn't look like a crash in Task Scheduler's history, just a
  skipped night that's worth noticing if it keeps happening.

.PARAMETER KeepCount
  How many of the newest backup zips to keep AT THE DESTINATION. Mirrors
  (but is independent of) the source-side cronMaxKeep=14 set in the
  migration - defaults to the same number here for one less thing to
  keep in sync mentally, but the destination may have very different
  space constraints (a small USB stick) so it's a separate parameter,
  not the same value read from settings.

.EXAMPLE
  # Manual run, ad hoc
  .\backup-offsite.ps1 -Destination "D:\GateMarkBackups"

.EXAMPLE
  # What the Scheduled Task should actually call - see README.md
  # "Automatic backups (deployment hardening item 2)" for the full
  # schtasks.exe command this maps to.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\gatemark\backend\backup-offsite.ps1" -Destination "D:\GateMarkBackups"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,

  [int]$KeepCount = 14
)

$ErrorActionPreference = "Stop"

# Resolve relative to this script's own location, not the caller's cwd -
# Task Scheduler's working directory isn't guaranteed to be backend\, and
# README's own backend-launch instructions warn about exactly this kind
# of cwd-dependent silent failure (see pocketbase.exe's own cwd note).
$backendDir = $PSScriptRoot
$sourceDir = Join-Path $backendDir "pb_data\backups"
$logFile = Join-Path $backendDir "backup-offsite.log"

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -Path $logFile -Value $line
}

try {
  if (-not (Test-Path $sourceDir)) {
    Write-Log "No pb_data\backups yet at $sourceDir - has the backup cron run at least once? Nothing to copy."
    exit 1
  }

  # Destination not existing isn't necessarily an error (first run against
  # a fresh USB drive), but an unreachable drive letter/share is - Test-Path
  # on a disconnected mapped drive returns $false either way, so this can't
  # tell the two apart. That ambiguity is fine here: both cases mean "can't
  # write the backup right now," which is exactly what should be logged and
  # exited non-zero for, not silently swallowed.
  if (-not (Test-Path $Destination)) {
    try {
      New-Item -ItemType Directory -Path $Destination -Force | Out-Null
      Write-Log "Created destination folder $Destination"
    } catch {
      Write-Log "Destination $Destination is not reachable ($($_.Exception.Message)) - skipping this run."
      exit 1
    }
  }

  $sourceZips = Get-ChildItem -Path $sourceDir -Filter "*.zip" -File |
    Sort-Object LastWriteTime

  if ($sourceZips.Count -eq 0) {
    Write-Log "pb_data\backups exists but has no .zip files yet - nothing to copy."
    exit 0
  }

  $copied = 0
  foreach ($zip in $sourceZips) {
    $destPath = Join-Path $Destination $zip.Name
    if (-not (Test-Path $destPath)) {
      Copy-Item -Path $zip.FullName -Destination $destPath -Force
      $copied++
    }
  }
  Write-Log "Copied $copied new backup(s) to $Destination"

  # Prune the destination independently of the source's own cronMaxKeep -
  # a small USB stick may not have room for as many copies as pb_data
  # keeps locally.
  $destZips = Get-ChildItem -Path $Destination -Filter "*.zip" -File |
    Sort-Object LastWriteTime -Descending
  if ($destZips.Count -gt $KeepCount) {
    $toRemove = $destZips | Select-Object -Skip $KeepCount
    foreach ($old in $toRemove) {
      Remove-Item -Path $old.FullName -Force
      Write-Log "Removed old offsite backup $($old.Name) (keeping newest $KeepCount)"
    }
  }

  Write-Log "Offsite backup run complete."
  exit 0
} catch {
  Write-Log "Offsite backup run FAILED: $($_.Exception.Message)"
  exit 1
}
