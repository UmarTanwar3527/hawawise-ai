"use client";

import { useState, type KeyboardEvent } from "react";

import { useElementWidth } from "@/lib/hooks/use-element-width";
import { formatConcentration } from "@/lib/utils/format";

import { hourRangeLabel } from "../format";

type Row = { hour: number; pm25: number | null; samples: number };

const HEIGHT = 200;
const MARGIN = { top: 22, right: 8, bottom: 26, left: 36 };

function niceCeiling(max: number) {
  const raw = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return { top: Math.ceil(max / step) * step, step };
}

/** Mean measured PM2.5 by IST hour of day. One series; peak and lowest hours labelled. */
export function HourOfDayChart({ hours, peak, lowest }: { hours: Row[]; peak: number | null; lowest: number | null }) {
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 120);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const { top, step } = niceCeiling(Math.max(0, ...hours.map((h) => h.pm25 ?? 0)) * 1.1);
  const band = plotWidth / 24;
  const gap = Math.min(3, band * 0.25);
  const barWidth = Math.max(band - gap, 2);
  const x = (h: number) => MARGIN.left + h * band + gap / 2;
  const y = (v: number) => MARGIN.top + plotHeight - (v / top) * plotHeight;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const every = width < 480 ? 6 : 3;
  const row = active !== null ? hours[active] : undefined;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? 24) - 1));
    else if (event.key === "ArrowRight") setActive((i) => Math.min(23, (i ?? -1) + 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  const tag = (hour: number) => (hour === peak ? "Peak" : hour === lowest ? "Lowest" : null);

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Mean measured PM2.5 by hour of day, India Standard Time. Use left and right arrow keys to read each hour."
        className="relative overflow-hidden rounded-lg outline-offset-4"
        onKeyDown={onKeyDown}
        onFocus={() => setActive((i) => i ?? peak ?? 0)}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} aria-hidden="true" className="block max-w-full touch-pan-y" onPointerLeave={() => setActive(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" />
              <text x={MARGIN.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-subtle text-[11px] tabular-nums">
                {t.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {hours.map((h) => {
            const height = h.pm25 !== null ? Math.max(plotHeight - (y(h.pm25) - MARGIN.top), 1) : 0;
            const r = Math.min(4, barWidth / 2, height);
            const label = tag(h.hour);
            return (
              <g key={h.hour} onPointerEnter={() => setActive(h.hour)}>
                <rect x={MARGIN.left + h.hour * band} y={MARGIN.top} width={band} height={plotHeight} fill="transparent" />
                {h.pm25 !== null ? (
                  <path
                    d={`M${x(h.hour)},${y(h.pm25) + height}V${y(h.pm25) + r}Q${x(h.hour)},${y(h.pm25)} ${x(h.hour) + r},${y(h.pm25)}H${x(h.hour) + barWidth - r}Q${x(h.hour) + barWidth},${y(h.pm25)} ${x(h.hour) + barWidth},${y(h.pm25) + r}V${y(h.pm25) + height}Z`}
                    fill={label === "Peak" ? "var(--color-navy)" : "var(--color-series-1)"}
                    opacity={active === null || active === h.hour ? 1 : 0.55}
                  />
                ) : null}
                {label && h.pm25 !== null ? (
                  <text
                    x={Math.min(Math.max(x(h.hour) + barWidth / 2, MARGIN.left + 22), MARGIN.left + plotWidth - 22)}
                    y={y(h.pm25) - 6}
                    textAnchor="middle"
                    className="fill-ink text-[11px] font-semibold"
                  >
                    {label}
                  </text>
                ) : null}
                {h.hour % every === 0 ? (
                  <text x={x(h.hour) + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-subtle text-[11px]">
                    {hourRangeLabel(h.hour).split("–")[0]}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {row ? (
          <div
            className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-raised"
            style={{ left: Math.min(Math.max(x(row.hour) + barWidth / 2 - 80, 0), Math.max(width - 168, 0)) }}
          >
            <p className="font-medium text-ink-subtle">{hourRangeLabel(row.hour)} IST</p>
            <p className="mt-1">
              <strong className="font-semibold text-ink">{row.pm25 !== null ? `${formatConcentration(row.pm25)} µg/m³` : "Too few values"}</strong>{" "}
              <span className="text-ink-subtle">mean PM2.5</span>
            </p>
            <p className="mt-0.5 text-ink-subtle">{row.samples} station-hours</p>
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {row ? `${hourRangeLabel(row.hour)}: mean PM2.5 ${row.pm25 ?? "not available"} micrograms per cubic metre from ${row.samples} station-hours.` : ""}
        </p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-primary">Show data table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Mean PM2.5 by hour of day</caption>
            <thead className="sticky top-0 bg-canvas text-ink-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Hour (IST)</th>
                <th scope="col" className="px-3 py-2 font-medium">Mean PM2.5 (µg/m³)</th>
                <th scope="col" className="px-3 py-2 font-medium">Station-hours</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {hours.map((h) => (
                <tr key={h.hour} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 font-normal text-ink-muted">{hourRangeLabel(h.hour)}</th>
                  <td className="px-3 py-1.5 text-ink">{h.pm25 !== null ? formatConcentration(h.pm25) : "—"}</td>
                  <td className="px-3 py-1.5 text-ink-muted">{h.samples}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
