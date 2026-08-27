// Design system, from the plan doc section 8: "professional and calm
// rather than playful, since staff will be looking at this all day."

export const colors = {
  primary: "#1F4D3A", // deep forest green
  primaryDark: "#153A2A",
  accent: "#D98E30", // warm amber - assigned-number callout, pending-sync

  // Status
  success: "#1E8E3E",
  successBg: "#E6F4EA",
  danger: "#D93025",
  dangerBg: "#FCE8E6",
  pending: "#D98E30",
  pendingBg: "#FCEEDA",

  // Neutrals - Tailwind slate scale
  slate50: "#F8FAFC",
  slate100: "#F1F5F9",
  slate200: "#E2E8F0",
  slate300: "#CBD5E1",
  slate400: "#94A3B8",
  slate500: "#64748B",
  slate600: "#475569",
  slate700: "#334155",
  slate800: "#1E293B",
  slate900: "#0F172A",

  white: "#FFFFFF",
  black: "#000000",
};

export type ScanState = "valid" | "duplicate" | "pending" | "failed" | "idle";

export const scanStateColors: Record<
  Exclude<ScanState, "idle">,
  { bg: string; fg: string; border: string }
> = {
  valid: { bg: colors.successBg, fg: colors.success, border: colors.success },
  duplicate: { bg: colors.dangerBg, fg: colors.danger, border: colors.danger },
  pending: { bg: colors.pendingBg, fg: colors.pending, border: colors.pending },
  failed: { bg: colors.dangerBg, fg: colors.danger, border: colors.danger },
};
