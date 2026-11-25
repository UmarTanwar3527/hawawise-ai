"use client";

import { useState, type KeyboardEvent } from "react";

import { useElementWidth } from "@/lib/hooks/use-element-width";
import { formatConcentration } from "@/lib/utils/format";

import { dayLabel } from "../format";
import type { DailyPoint } from "../services/compute";

const SERIES = [
  { key: "pm25", label: "PM2.5", color: "var(--color-series-1)" },
  { key: "pm10", label: "PM10", color: "var(--color-series-2)" },
] as const;
type Key = (typeof SERIES)[number]["key"];

const HEIGHT = 240;
const MARGIN = { top: 16, right: 64, bottom: 28, left: 40 };

function niceCeiling(max: number) {
  const raw = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return { top: Math.ceil(max / step) * step, step };
}

/** City daily means (station measurements) for PM2.5 and PM10, one µg/m³ axis. */
export function DailyTrendChart({ daily }: { daily: DailyPoint[] }) {
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 120);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = Math.max(0, ...daily.flatMap((d) => [d.pm25 ?? 0, d.pm10 ?? 0]));
  const { top, step } = niceCeiling(max * 1.08);
  const x = (i: number) => MARGIN.left + (daily.length > 1 ? (i / (daily.length - 1)) * plotWidth : plotWidth / 2);
  const y = (v: number) => MARGIN.top + plotHeight - (v / top) * plotHeight;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const path = (key: Key) => {
    let d = "";
    let joined = false;
    daily.forEach((point, i) => {
      const value = point[key];
      if (value === null) {
        joined = false;
        return;
      }
      d += `${joined ? "L" : "M"}${x(i).toFixed(1)},${y(value).toFixed(1)}`;
      joined = true;
    });
    return d;
  };

  const ends = SERIES.map((s) => {
    let index = -1;
    daily.forEach((d, i) => {
      if (d[s.key] !== null) index = i;
    });
    return index >= 0 ? { ...s, value: daily[index]?.[s.key] as number, y: y(daily[index]?.[s.key] as number) } : null;
  }).filter((e): e is NonNullable<typeof e> => e !== null);
  const showEnds = ends.length < 2 || Math.abs((ends[0]?.y ?? 0) - (ends[1]?.y ?? 0)) >= 16;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? daily.length) - 1));
    else if (event.key === "ArrowRight") setActive((i) => Math.min(daily.length - 1, (i ?? -1) + 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };
  const point = active !== null ? daily[active] : undefined;
  const nearest = (clientX: number, el: Element) => {
    const left = el.getBoundingClientRect().left;
    const ratio = (clientX - left - MARGIN.left) / plotWidth;
    return Math.min(daily.length - 1, Math.max(0, Math.round(ratio * (daily.length - 1))));
  };

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-4 text-xs text-ink-muted" aria-label="Legend">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label} (µg/m³, city mean of station daily means)
          </li>
        ))}
      </ul>
      <div
        ref={ref}
        tabIndex={0}
        role="group"
        aria-label="Daily city mean PM2.5 and PM10 from station measurements. Use left and right arrow keys to read each day."
        className="relative overflow-hidden rounded-lg outline-offset-4"
        onKeyDown={onKeyDown}
        onFocus={() => setActive((i) => i ?? daily.length - 1)}
        onBlur={() => setActive(null)}
      >
        <svg
          width={width}
          height={HEIGHT}
          aria-hidden="true"
          className="block max-w-full touch-pan-y"
          onPointerMove={(e) => setActive(nearest(e.clientX, e.currentTarget))}
          onPointerLeave={() => setActive(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(t)} y2={y(t)} stroke="var(--color-grid)" />
              <text x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-subtle text-[11px] tabular-nums">
                {t.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {daily.map((d, i) =>
            width >= 480 || i % 2 === 0 || i === daily.length - 1 ? (
              <text key={d.day} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-subtle text-[11px]">
                {dayLabel(d.day).replace(/^\w+ /, "")}
              </text>
            ) : null,
          )}
          {SERIES.map((s) => (
            <g key={s.key}>
              <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {daily.map((d, i) =>
                d[s.key] !== null ? (
                  <circle key={d.day} cx={x(i)} cy={y(d[s.key] as number)} r={active === i ? 5 : 3.5} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
                ) : null,
              )}
            </g>
          ))}
          {showEnds
            ? ends.map((e) => (
                <text key={e.key} x={MARGIN.left + plotWidth + 8} y={e.y} dy="0.32em" className="fill-ink text-[11px] font-medium">
                  {e.label} {formatConcentration(e.value)}
                </text>
              ))
            : null}
          {point ? <line x1={x(active ?? 0)} x2={x(active ?? 0)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="var(--color-ink-subtle)" /> : null}
        </svg>
        {point ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-raised"
            style={{ left: Math.min(Math.max(x(active ?? 0) - 80, 0), Math.max(width - 168, 0)) }}
          >
            <p className="font-medium text-ink-subtle">{dayLabel(point.day)}</p>
            {SERIES.map((s) => (
              <p key={s.key} className="mt-1 flex items-center gap-2">
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                <strong className="font-semibold text-ink">{point[s.key] !== null ? formatConcentration(point[s.key] as number) : "—"}</strong>
                <span className="text-ink-subtle">{s.label}</span>
              </p>
            ))}
            <p className="mt-1 text-ink-subtle">{point.stations} stations with 18+ hours</p>
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {point
            ? `${dayLabel(point.day)}: PM2.5 ${point.pm25 ?? "not available"}, PM10 ${point.pm10 ?? "not available"} micrograms per cubic metre.`
            : ""}
        </p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-primary">Show data table</summary>
        <div className="mt-2 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Daily city means</caption>
            <thead className="bg-canvas text-ink-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Day</th>
                <th scope="col" className="px-3 py-2 font-medium">PM2.5</th>
                <th scope="col" className="px-3 py-2 font-medium">PM10</th>
                <th scope="col" className="px-3 py-2 font-medium">Mean AQI</th>
                <th scope="col" className="px-3 py-2 font-medium">Highest station AQI</th>
                <th scope="col" className="px-3 py-2 font-medium">Stations</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {daily.map((d) => (
                <tr key={d.day} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 font-normal text-ink-muted">{dayLabel(d.day)}</th>
                  <td className="px-3 py-1.5 text-ink">{d.pm25 !== null ? formatConcentration(d.pm25) : "—"}</td>
                  <td className="px-3 py-1.5 text-ink">{d.pm10 !== null ? formatConcentration(d.pm10) : "—"}</td>
                  <td className="px-3 py-1.5 text-ink">{d.aqiMean ?? "—"}</td>
                  <td className="px-3 py-1.5 text-ink">{d.aqiMax ?? "—"}</td>
                  <td className="px-3 py-1.5 text-ink-muted">{d.stations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
