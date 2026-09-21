"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { maxChartUnit, toChartUnit } from "../lib/chart-unit";

export interface ChartSeriesItem {
  id: string;
  label: string;
  /** Original decimal string from the API. Used for labels via `formatted`. */
  value: string;
  formatted: string;
  pattern?: ChartPatternId;
}

export type ChartPatternId = "solid" | "stripes" | "dots" | "hatch" | "dashes";

const PATTERN_ORDER: ChartPatternId[] = ["solid", "stripes", "dots", "hatch", "dashes"];

const FILL_CLASS: Record<ChartPatternId, string> = {
  solid: "fill-teal",
  stripes: "fill-copper",
  dots: "fill-teal-dark",
  hatch: "fill-ink",
  dashes: "fill-emerald-800",
};

function ChartPatterns({ prefix }: { prefix: string }) {
  return (
    <defs>
      <pattern id={`${prefix}-stripes`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" className="fill-copper/20" />
        <line x1="0" y1="0" x2="0" y2="6" className="stroke-copper" strokeWidth="3" />
      </pattern>
      <pattern id={`${prefix}-dots`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" className="fill-teal-dark/15" />
        <circle cx="2" cy="2" r="1.5" className="fill-teal-dark" />
      </pattern>
      <pattern id={`${prefix}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" className="fill-ink/10" />
        <path d="M0 8 L8 0" className="stroke-ink" strokeWidth="1.5" />
      </pattern>
      <pattern id={`${prefix}-dashes`} width="10" height="6" patternUnits="userSpaceOnUse">
        <rect width="10" height="6" className="fill-emerald-800/10" />
        <line x1="0" y1="3" x2="6" y2="3" className="stroke-emerald-800" strokeWidth="2" />
      </pattern>
    </defs>
  );
}

function patternFill(prefix: string, pattern: ChartPatternId): string {
  if (pattern === "solid") return "currentColor";
  return `url(#${prefix}-${pattern})`;
}

function AccessibleChartTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: Array<{ id: string; cells: string[] }>;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
            {headers.map((header) => (
              <th key={header} scope="col" className="px-3 py-2">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-line last:border-0">
              {row.cells.map((cell, index) => (
                <td key={`${row.id}-${index}`} className={cn("px-3 py-2", index > 0 && "text-right")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BarChart({
  data,
  ariaLabel,
  valueHeader,
  emptyLabel,
  signed = false,
}: {
  data: ChartSeriesItem[];
  ariaLabel: string;
  valueHeader: string;
  emptyLabel: string;
  signed?: boolean;
}) {
  const t = useTranslations("reports");
  const uid = React.useId();
  const width = 720;
  const height = 240;
  const padX = 24;
  const padTop = 24;
  const padBottom = 48;
  const innerHeight = height - padTop - padBottom;
  const baseline = signed ? padTop + innerHeight / 2 : padTop + innerHeight;
  const plotHeight = signed ? innerHeight / 2 : innerHeight;
  const max = Math.max(1, maxChartUnit(data.map((d) => d.value)));
  const barWidth = data.length > 0 ? Math.min(48, (width - padX * 2) / data.length - 8) : 0;

  if (data.length === 0) {
    return <p className="rounded-3xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        className="h-64 w-full text-teal"
      >
        <ChartPatterns prefix={uid} />
        <line x1={padX} y1={baseline} x2={width - padX} y2={baseline} className="stroke-line" strokeWidth="1" />
        {data.map((item, index) => {
          const unit = toChartUnit(item.value);
          const mag = Math.abs(unit);
          const barH = (mag / max) * plotHeight;
          const x = padX + index * ((width - padX * 2) / data.length) + 4;
          const y = unit >= 0 ? baseline - barH : baseline;
          const pattern: ChartPatternId = signed && unit < 0 ? "hatch" : (item.pattern ?? "solid");
          const negative = signed && unit < 0;
          return (
            <g key={item.id}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, unit === 0 ? 0 : 2)}
                fill={patternFill(uid, pattern)}
                className={negative ? "text-red-700" : FILL_CLASS[pattern]}
                rx="4"
              />
              <text x={x + barWidth / 2} y={height - 28} textAnchor="middle" className="fill-muted text-[10px]">
                {item.label.length > 12 ? `${item.label.slice(0, 11)}…` : item.label}
              </text>
              {negative ? (
                <text x={x + barWidth / 2} y={y + barH + 12} textAnchor="middle" className="fill-red-800 text-[9px] font-semibold">
                  {t("loss")}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <AccessibleChartTable
        caption={ariaLabel}
        headers={[t("period"), valueHeader]}
        rows={data.map((item) => ({
          id: item.id,
          cells: [item.label, item.formatted],
        }))}
      />
    </div>
  );
}

export function LineChart({
  data,
  ariaLabel,
  valueHeader,
  emptyLabel,
}: {
  data: ChartSeriesItem[];
  ariaLabel: string;
  valueHeader: string;
  emptyLabel: string;
}) {
  const t = useTranslations("reports");
  const width = 720;
  const height = 240;
  const padX = 28;
  const padTop = 20;
  const padBottom = 48;
  const innerWidth = width - padX * 2;
  const innerHeight = height - padTop - padBottom;
  const max = Math.max(1, maxChartUnit(data.map((d) => d.value)));

  if (data.length === 0) {
    return <p className="rounded-3xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  const points = data.map((item, index) => {
    const x = padX + (data.length === 1 ? innerWidth / 2 : (index / (data.length - 1)) * innerWidth);
    const y = padTop + innerHeight - (toChartUnit(item.value) / max) * innerHeight;
    return { x, y, item };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const labelEvery = Math.max(1, Math.ceil(data.length / 8));

  return (
    <div>
      <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <line x1={padX} y1={padTop + innerHeight} x2={width - padX} y2={padTop + innerHeight} className="stroke-line" strokeWidth="1" />
        <polyline points={polyline} fill="none" className="stroke-teal" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((point, index) => (
          <g key={point.item.id}>
            <circle cx={point.x} cy={point.y} r="4" className="fill-teal" />
            <circle cx={point.x} cy={point.y} r="2" className="fill-paper" />
            {index % labelEvery === 0 ? (
              <text x={point.x} y={height - 28} textAnchor="middle" className="fill-muted text-[10px]">
                {point.item.label.length > 10 ? `${point.item.label.slice(0, 9)}…` : point.item.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <AccessibleChartTable
        caption={ariaLabel}
        headers={[t("period"), valueHeader]}
        rows={data.map((item) => ({ id: item.id, cells: [item.label, item.formatted] }))}
      />
    </div>
  );
}

export interface StackedSegment {
  id: string;
  label: string;
  value: string;
  formatted: string;
  pattern: ChartPatternId;
}

export function StackedBarChart({
  bars,
  ariaLabel,
  emptyLabel,
  categoryHeader,
}: {
  bars: Array<{ id: string; label: string; segments: StackedSegment[] }>;
  ariaLabel: string;
  emptyLabel: string;
  categoryHeader: string;
}) {
  const t = useTranslations("reports");
  const uid = React.useId();
  const width = 720;
  const height = 240;
  const padX = 24;
  const padTop = 16;
  const padBottom = 56;
  const innerHeight = height - padTop - padBottom;

  const totals = bars.map((bar) => bar.segments.reduce((sum, seg) => sum + Math.max(0, toChartUnit(seg.value)), 0));
  const max = Math.max(1, ...totals);
  const barWidth = bars.length > 0 ? Math.min(56, (width - padX * 2) / bars.length - 8) : 0;
  const legendItems = bars[0]?.segments ?? [];

  if (bars.length === 0) {
    return <p className="rounded-3xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  const tableHeaders = [categoryHeader, ...legendItems.map((seg) => seg.label)];
  const tableRows = bars.map((bar) => ({
    id: bar.id,
    cells: [bar.label, ...bar.segments.map((seg) => seg.formatted)],
  }));

  return (
    <div>
      <svg role="img" aria-label={ariaLabel} viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
        <ChartPatterns prefix={uid} />
        {bars.map((bar, index) => {
          const x = padX + index * ((width - padX * 2) / bars.length) + 4;
          let y = padTop + innerHeight;
          return (
            <g key={bar.id}>
              {bar.segments.map((seg) => {
                const h = (Math.max(0, toChartUnit(seg.value)) / max) * innerHeight;
                y -= h;
                return (
                  <rect
                    key={seg.id}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={patternFill(uid, seg.pattern)}
                    className={FILL_CLASS[seg.pattern]}
                  />
                );
              })}
              <text x={x + barWidth / 2} y={height - 36} textAnchor="middle" className="fill-muted text-[10px]">
                {bar.label.length > 12 ? `${bar.label.slice(0, 11)}…` : bar.label}
              </text>
            </g>
          );
        })}
      </svg>
      {legendItems.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-3 text-xs text-ink">
          {legendItems.map((seg) => (
            <li key={seg.id} className="inline-flex items-center gap-2">
              <span className="inline-flex h-3 w-5 overflow-hidden rounded-sm border border-line" aria-hidden="true">
                <svg width="20" height="12" className="block">
                  <ChartPatterns prefix={`${uid}-lg`} />
                  <rect width="20" height="12" fill={patternFill(`${uid}-lg`, seg.pattern)} className={FILL_CLASS[seg.pattern]} />
                </svg>
              </span>
              <span>
                {seg.label}
                <span className="sr-only">{` — ${t(`pattern.${seg.pattern}`)}`}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <AccessibleChartTable caption={ariaLabel} headers={tableHeaders} rows={tableRows} />
    </div>
  );
}

export function patternForIndex(index: number): ChartPatternId {
  return PATTERN_ORDER[index % PATTERN_ORDER.length];
}
