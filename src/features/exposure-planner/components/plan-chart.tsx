"use client";

import { useState, type KeyboardEvent } from "react";

import { useElementWidth } from "@/lib/hooks/use-element-width";
import { formatConcentration, formatTimeIst } from "@/lib/utils/format";

import type { ForecastPoint } from "../services/plan";

const HEIGHT = 220;
const MARGIN = { top: 24, right: 8, bottom: 28, left: 36 };
const HOUR = 3_600_000;

const COLORS = {
  inRange: "var(--color-series-1)",
  outside: "var(--color-line-strong)",
  lowest: "var(--color-navy)",
};

const hourFormatter = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: true });

function niceCeiling(max: number): { top: number; step: number } {
  const raw = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return { top: Math.ceil(max / step) * step, step };
}

type Bar = ForecastPoint & { t: number; inRange: boolean; lowest: boolean };

/**
 * Hourly forecast PM2.5 for the planned day. One measure, one axis: bars in the
 * visitor's time range are coloured, others are grey, and the hours of the
 * lowest-ranked window are dark. A table view is always available.
 */
export function PlanChart({
  points,
  rangeFrom,
  rangeTo,
  lowestStart,
  lowestHours,
}: {
  points: ForecastPoint[];
  /** IST hours bounding the visitor's range. */
  rangeFrom: number;
  rangeTo: number;
  lowestStart: string | null;
  lowestHours: number;
}) {
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);

  const lowestT = lowestStart ? Date.parse(lowestStart) : null;
  const bars: Bar[] = points.map((point) => {
    const t = Date.parse(point.at);
    const minute = Math.floor(t / 60_000 + 330) % 1440;
    return {
      ...point,
      t,
      inRange: minute >= rangeFrom * 60 && minute < rangeTo * 60,
      lowest: lowestT !== null && t >= lowestT && t < lowestT + lowestHours * HOUR,
    };
  });

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 120);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const maxValue = Math.max(0, ...bars.map((b) => b.pm25 ?? 0));
  const { top, step } = niceCeiling(maxValue * 1.08);
  const band = plotWidth / Math.max(bars.length, 1);
  const gap = Math.min(4, band * 0.25);
  const barWidth = Math.max(band - gap, 2);
  const x = (index: number) => MARGIN.left + index * band + gap / 2;
  const y = (value: number) => MARGIN.top + plotHeight - (value / top) * plotHeight;
  const yTicks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = width < 480 ? 6 : 3;
  const firstLowest = bars.findIndex((b) => b.lowest);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? bars.length) - 1));
    else if (event.key === "ArrowRight") setActive((i) => Math.min(bars.length - 1, (i ?? -1) + 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };
  const activeBar = active !== null ? bars[active] : undefined;
  const status = (bar: Bar) => (bar.lowest ? "Lowest window" : bar.inRange ? "In your time range" : "Outside your time range");

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted" aria-label="Legend">
        {[
          ["Lowest window", COLORS.lowest],
          ["In your time range", COLORS.inRange],
          ["Outside your range", COLORS.outside],
        ].map(([label, color]) => (
          <li key={label} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: color }} />
            {label}
          </li>
        ))}
      </ul>

      <div
        ref={ref}
        className="relative overflow-hidden rounded-lg outline-offset-4"
        tabIndex={0}
        role="group"
        aria-label="Forecast PM2.5 by hour for the planned day, in micrograms per cubic metre. Use left and right arrow keys to read each hour."
        onKeyDown={onKeyDown}
        onFocus={() => setActive((i) => i ?? Math.max(firstLowest, 0))}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true" className="block max-w-full touch-pan-y" onPointerLeave={() => setActive(null)}>
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} stroke="var(--color-grid)" strokeWidth={1} />
              <text x={MARGIN.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-subtle text-[11px] tabular-nums">
                {tick.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {bars.map((bar, index) => {
            const height = bar.pm25 !== null ? Math.max(plotHeight - (y(bar.pm25) - MARGIN.top), 1) : 0;
            const fill = bar.lowest ? COLORS.lowest : bar.inRange ? COLORS.inRange : COLORS.outside;
            return (
              <g key={bar.t} onPointerEnter={() => setActive(index)}>
                {/* Hit target spans the full band height, larger than the bar. */}
                <rect x={MARGIN.left + index * band} y={MARGIN.top} width={band} height={plotHeight} fill="transparent" />
                {bar.pm25 !== null ? (
                  <path
                    d={roundedTopBar(x(index), y(bar.pm25), barWidth, height, Math.min(4, barWidth / 2))}
                    fill={fill}
                    opacity={active === null || active === index ? 1 : 0.55}
                  />
                ) : (
                  <text x={x(index) + barWidth / 2} y={MARGIN.top + plotHeight - 4} textAnchor="middle" className="fill-ink-subtle text-[10px]">
                    –
                  </text>
                )}
                {index % labelEvery === 0 ? (
                  <text x={x(index) + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-subtle text-[11px]">
                    {hourFormatter.format(new Date(bar.t))}
                  </text>
                ) : null}
              </g>
            );
          })}
          {firstLowest >= 0 && bars[firstLowest]?.pm25 != null ? (
            <text
              x={Math.min(Math.max(x(firstLowest) + barWidth / 2, MARGIN.left + 24), MARGIN.left + plotWidth - 24)}
              y={y(bars[firstLowest]?.pm25 ?? 0) - 8}
              textAnchor="middle"
              className="fill-ink text-[11px] font-semibold"
            >
              Lowest
            </text>
          ) : null}
        </svg>

        {activeBar ? (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-raised"
            style={{ left: Math.min(Math.max(x(active ?? 0) + barWidth / 2 - 80, 0), Math.max(width - 168, 0)) }}
          >
            <p className="font-medium text-ink-subtle">{formatTimeIst(activeBar.at)}</p>
            <p className="mt-1">
              <strong className="font-semibold text-ink">
                {activeBar.pm25 !== null ? `${formatConcentration(activeBar.pm25)} µg/m³` : "No value"}
              </strong>{" "}
              <span className="text-ink-subtle">PM2.5 forecast</span>
            </p>
            <p className="mt-0.5 text-ink-subtle">{status(activeBar)}</p>
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {activeBar
            ? `${formatTimeIst(activeBar.at)}: forecast PM2.5 ${activeBar.pm25 !== null ? `${formatConcentration(activeBar.pm25)} micrograms per cubic metre` : "not available"}. ${status(activeBar)}.`
            : ""}
        </p>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-primary">Show data table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Hourly forecast PM2.5 and PM10 for the planned day</caption>
            <thead className="sticky top-0 bg-canvas text-ink-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Time (IST)</th>
                <th scope="col" className="px-3 py-2 font-medium">PM2.5 (µg/m³)</th>
                <th scope="col" className="px-3 py-2 font-medium">PM10 (µg/m³)</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {bars.map((bar) => (
                <tr key={bar.t} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 font-normal text-ink-muted">{formatTimeIst(bar.at)}</th>
                  <td className="px-3 py-1.5 text-ink">{bar.pm25 !== null ? formatConcentration(bar.pm25) : "—"}</td>
                  <td className="px-3 py-1.5 text-ink">{bar.pm10 !== null ? formatConcentration(bar.pm10) : "—"}</td>
                  <td className="px-3 py-1.5 text-ink-muted">{status(bar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

/** Bar with a rounded data end and a square baseline. */
function roundedTopBar(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}
