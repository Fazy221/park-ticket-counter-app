import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

export function Alert({ tone, children }: { tone: "danger" | "success"; children: ReactNode }) {
  const Icon = tone === "danger" ? AlertTriangle : CheckCircle2;
  const classes =
    tone === "danger"
      ? "bg-gatemark-dangerBg text-gatemark-danger"
      : "bg-gatemark-successBg text-gatemark-success";
  return (
    <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${classes}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
