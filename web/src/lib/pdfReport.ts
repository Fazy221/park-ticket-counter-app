import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";

export type ReportSummary = {
  rangeLabel: string; // e.g. "Sep 1 - Sep 3, 2026"
  totals: { label: string; value: number }[];
  byCounter: { name: string; scanned: number }[];
  byStaff: { name: string; scanned: number; overrides: number }[];
};

// A printable summary report - the CSV export (see lib/csv.ts) is where
// the full per-ticket detail lives; this is deliberately just the
// roll-ups, since a PDF with thousands of individual scan rows isn't
// something anyone actually wants to print or hand to a manager. Built
// with jsPDF + autoTable rather than hand-rolled canvas drawing - the
// table layout, pagination, and header repeat-on-page-break this needs
// would be a lot of fragile code to get right from scratch.
export function generateReportPdf(summary: ReportSummary): void {
  const doc = new jsPDF();

  doc.setFontSize(16);
  doc.setTextColor(31, 77, 58); // gatemark.primary
  doc.text("GateMark Report", 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // slate-500
  doc.text(summary.rangeLabel, 14, 25);

  autoTable(doc, {
    startY: 32,
    head: [["Metric", "Count"]],
    body: summary.totals.map((t) => [t.label, String(t.value)]),
    theme: "plain",
    headStyles: { fillColor: [31, 77, 58], textColor: 255 },
    styles: { fontSize: 10 },
  });

  const afterTotalsY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42); // slate-900
  doc.text("By counter", 14, afterTotalsY + 10);
  autoTable(doc, {
    startY: afterTotalsY + 14,
    head: [["Counter", "Scanned"]],
    body: summary.byCounter.map((c) => [c.name, String(c.scanned)]),
    theme: "plain",
    headStyles: { fillColor: [31, 77, 58], textColor: 255 },
    styles: { fontSize: 10 },
  });

  const afterCounterY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  doc.setFontSize(12);
  doc.text("By staff", 14, afterCounterY + 10);
  autoTable(doc, {
    startY: afterCounterY + 14,
    head: [["Staff", "Scanned", "Overrides"]],
    body: summary.byStaff.map((s) => [s.name, String(s.scanned), String(s.overrides)]),
    theme: "plain",
    headStyles: { fillColor: [31, 77, 58], textColor: 255 },
    styles: { fontSize: 10 },
  });

  doc.save(`gatemark-report-${summary.rangeLabel.replace(/\s+/g, "-")}.pdf`);
}
