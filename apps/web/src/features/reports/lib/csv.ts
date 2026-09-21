/**
 * Client-side CSV download. Money and quantity cells MUST be the exact
 * decimal strings returned by the API — never `formatMoney` output or a
 * JS number. `downloadCsv` writes those strings through unchanged.
 */
function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function downloadCsv(filename: string, headers: string[], rows: ReadonlyArray<ReadonlyArray<string>>): void {
  const lines = [headers.map(escapeCsvCell).join(","), ...rows.map((row) => row.map(escapeCsvCell).join(","))];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
