import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "danger" | "pending" | "primary";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-gatemark-successBg text-gatemark-success",
  danger: "bg-gatemark-dangerBg text-gatemark-danger",
  pending: "bg-gatemark-pendingBg text-gatemark-pending",
  primary: "bg-emerald-50 text-gatemark-primary",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
