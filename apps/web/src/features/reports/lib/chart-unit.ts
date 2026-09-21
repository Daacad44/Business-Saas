/**
 * Converts a Decimal-as-string into a finite JS number used ONLY to compute
 * chart geometry (bar height, line y-coordinate, stacked-segment length).
 *
 * Displayed figures, CSV cells, axis/point labels, and accessible text must
 * use the original string with `formatMoney` / `formatQuantity` — never this
 * number. A non-finite parse yields 0 so a malformed value cannot crash layout.
 */
export function toChartUnit(decimal: string): number {
  const n = Number(decimal);
  return Number.isFinite(n) ? n : 0;
}

export function maxChartUnit(values: ReadonlyArray<string>): number {
  let max = 0;
  for (const value of values) {
    const n = Math.abs(toChartUnit(value));
    if (n > max) max = n;
  }
  return max;
}
