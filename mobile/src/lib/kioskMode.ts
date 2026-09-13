import { Platform } from "react-native";

// Deployment hardening item 4 (see README "Single-app kiosk mode").
// Thin wrapper around the local native module in mobile/modules/kiosk-mode/.
//
// The native module only exists on Android (counter devices are plain
// Android phones - this item never targeted iOS), and only exists at all
// in a dev/production build made *after* this module was added -
// Expo Go can never include a custom native module, and an older dev
// client build won't either. Both cases must degrade to a silent no-op
// rather than crash the app on import, so the native require is lazy,
// gated on Platform.OS, and wrapped in try/catch.
type KioskModeNativeModule = {
  startKioskMode(): void;
  stopKioskMode(): void;
  isInKioskMode(): boolean;
};

// Metro supports plain CommonJS `require()` at runtime, but the project
// has no @types/node (nothing else here needed it), so TypeScript alone
// doesn't know the global `require` exists. Declared locally rather than
// pulling in @types/node for one call site.
declare const require: (id: string) => { default: KioskModeNativeModule };

let native: KioskModeNativeModule | null = null;

if (Platform.OS === "android") {
  try {
    // Relative require, not a package-name import: this module isn't
    // published, it's autolinked purely by living under mobile/modules/.
    native = require("../../modules/kiosk-mode").default;
  } catch {
    native = null;
  }
}

/** True once real Screen Pinning is available on this build/device. */
export const kioskModeAvailable = native !== null;

/**
 * Pins the app to the screen (Android Screen Pinning / app-invoked lock
 * task - see module header comment for why this isn't Device Owner mode).
 * Safe to call repeatedly, including when already pinned.
 */
export function startKioskMode(): void {
  try {
    native?.startKioskMode();
  } catch {
    // See KioskModeModule.kt - expected on some OEM builds, not fatal.
  }
}

/**
 * Unpins the app. Used by the Settings screen's "Exit kiosk mode" toggle
 * so a technician can reach the Android home screen / system settings
 * without needing to know the physical Back+Recents unpin gesture.
 */
export function stopKioskMode(): void {
  try {
    native?.stopKioskMode();
  } catch {
    // Throws if not currently pinned - fine to ignore.
  }
}

/** Current pinned/unpinned state, read live from the OS. */
export function isInKioskMode(): boolean {
  try {
    return native?.isInKioskMode() ?? false;
  } catch {
    return false;
  }
}
