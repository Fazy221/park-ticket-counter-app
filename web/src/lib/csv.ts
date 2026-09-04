// Hand-rolled rather than pulling in a CSV library - the quoting rules
// for CSV are small and well-defined (RFC 4180: wrap in quotes if the
// value contains a comma, quote, or newline; double up any internal
// quotes), and this app already avoids adding dependencies where a
// straightforward implementation covers it (see the note on hand-rolled
// UI primitives in the README).
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }
  // \r\n per RFC 4180 - keeps Excel on Windows happy, which matters more
  // here than it would for a Unix-only tool since this is exactly the
  // "opens in Excel/Sheets" use case.
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = toCsv(headers, rows);
  // BOM so Excel recognizes the file as UTF-8 (without it, accented
  // characters in staff names etc. can render as mojibake on Windows).
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
