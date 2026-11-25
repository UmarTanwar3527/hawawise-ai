"use client";

import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import { useElementWidth } from "@/lib/hooks/use-element-width";
import { formatConcentration, formatTimeIst } from "@/lib/utils/format";

import type { StationHistoryPoint } from "../../services/area-air-quality";

const SERIES = [
  { key: "pm25", label: "PM2.5", color: "var(--color-series-1)" },
  { key: "pm10", label: "PM10", color: "var(--color-series-2)" },
] as const;
type SeriesKey = (typeof SERIES)[number]["key"];

const HEIGHT = 240;
const MARGIN = { top: 16, right: 64, bottom: 28, left: 40 };
const HOUR = 3_600_000;

const hourFormatter = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  hour12: true,
});

type Point = { t: number; iso: string } & Record<SeriesKey, number | null>;

function niceCeiling(max: number): { top: number; step: number } {
  const raw = Math.max(max, 1) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw;
  return { top: Math.ceil(max / step) * step, step };
}

/** SVG path that breaks at missing values and at gaps longer than 90 minutes. */
function buildPath(points: Point[], key: SeriesKey, x: (t: number) => number, y: (v: number) => number) {
  let d = "";
  let previous: Point | null = null;
  for (const point of points) {
    const value = point[key];
    if (value === null) {
      previous = null;
      continue;
    }
    const joined = previous && previous[key] !== null && point.t - previous.t <= 1.5 * HOUR;
    d += `${joined ? "L" : "M"}${x(point.t).toFixed(1)},${y(value).toFixed(1)}`;
    previous = point;
  }
  return d;
}

export function HourlyTrendChart({ history, stationName }: { history: StationHistoryPoint[]; stationName: string }) {
  const { ref, width } = useElementWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);

  const points: Point[] = useMemo(
    () =>
      history.map((entry) => {
        const pick = (key: SeriesKey) => {
          const value = entry.values[key];
          return value && value.unit === "ug_m3" ? value.value : null;
        };
        return { t: Date.parse(entry.observedAt), iso: entry.observedAt, pm25: pick("pm25"), pm10: pick("pm10") };
      }),
    [history],
  );

  const plotWidth = Math.max(width - MARGIN.left - MARGIN.right, 120);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const tMin = points[0]?.t ?? 0;
  const tMax = points.at(-1)?.t ?? 1;
  const maxValue = Math.max(0, ...points.flatMap((p) => [p.pm25 ?? 0, p.pm10 ?? 0]));
  const { top, step } = niceCeiling(maxValue * 1.05);

  const x = (t: number) => MARGIN.left + ((t - tMin) / Math.max(tMax - tMin, 1)) * plotWidth;
  const y = (v: number) => MARGIN.top + plotHeight - (v / top) * plotHeight;

  const yTicks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const xTickCount = width < 480 ? 3 : 5;
  const xTicks = Array.from({ length: xTickCount }, (_, i) => tMin + ((tMax - tMin) * i) / (xTickCount - 1));

  // Direct end labels, only when they do not collide.
  const endLabels = SERIES.map((series) => {
    const last = [...points].reverse().find((p) => p[series.key] !== null);
    return last ? { ...series, value: last[series.key] as number, y: y(last[series.key] as number) } : null;
  }).filter((label): label is NonNullable<typeof label> => label !== null);
  const showEndLabels =
    endLabels.length < 2 || Math.abs((endLabels[0]?.y ?? 0) - (endLabels[1]?.y ?? 0)) >= 16;

  const nearestIndex = (clientX: number, element: Element) => {
    const bounds = element.getBoundingClientRect();
    const t = tMin + ((clientX - bounds.left - MARGIN.left) / plotWidth) * (tMax - tMin);
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.t - t) < Math.abs((points[best]?.t ?? 0) - t)) best = i;
    });
    return best;
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => setActive(nearestIndex(event.clientX, event.currentTarget));
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") setActive((i) => Math.max(0, (i ?? points.length) - 1));
    else if (event.key === "ArrowRight") setActive((i) => Math.min(points.length - 1, (i ?? -1) + 1));
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  const activePoint = active !== null ? points[active] : undefined;
  const latest = endLabels.map((l) => `${l.label} ${formatConcentration(l.value)} µg/m³`).join(", ");

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-4 text-xs text-ink-muted" aria-label="Legend">
        {SERIES.map((series) => (
          <li key={series.key} className="flex items-center gap-2">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: series.color }} />
            {series.label} (µg/m³)
          </li>
        ))}
      </ul>

      <div
        ref={ref}
        className="relative overflow-hidden rounded-lg outline-offset-4"
        tabIndex={0}
        role="group"
        aria-label={`Hourly PM2.5 and PM10 at ${stationName}. Latest: ${latest}. Use left and right arrow keys to read hourly values.`}
        onKeyDown={onKeyDown}
        onFocus={() => setActive((i) => i ?? points.length - 1)}
        onBlur={() => setActive(null)}
      >
        <svg
          width={width}
          height={HEIGHT}
          aria-hidden="true"
          className="block max-w-full touch-pan-y"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(tick)} y2={y(tick)} stroke="var(--color-grid)" strokeWidth={1} />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-subtle text-[11px] tabular-nums">
                {tick.toLocaleString("en-IN")}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text key={tick} x={x(tick)} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-subtle text-[11px]">
              {hourFormatter.format(new Date(tick))}
            </text>
          ))}

          {SERIES.map((series) => (
            <path
              key={series.key}
              d={buildPath(points, series.key, x, y)}
              fill="none"
              stroke={series.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {showEndLabels
            ? endLabels.map((label) => (
                <text key={label.key} x={MARGIN.left + plotWidth + 8} y={label.y} dy="0.32em" className="fill-ink text-[11px] font-medium">
                  {label.label} {formatConcentration(label.value)}
                </text>
              ))
            : null}

          {activePoint ? (
            <g>
              <line x1={x(activePoint.t)} x2={x(activePoint.t)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke="var(--color-ink-subtle)" strokeWidth={1} />
              {SERIES.map((series) =>
                activePoint[series.key] !== null ? (
                  <circle
                    key={series.key}
                    cx={x(activePoint.t)}
                    cy={y(activePoint[series.key] as number)}
                    r={4.5}
                    fill={series.color}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                ) : null,
              )}
            </g>
          ) : null}
        </svg>

        {activePoint ? (
          <div
            className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-raised"
            style={{
              left: Math.min(Math.max(x(activePoint.t) - 72, 0), Math.max(width - 152, 0)),
            }}
          >
            <p className="font-medium text-ink-subtle">Hour ending {formatTimeIst(activePoint.iso)}</p>
            {SERIES.map((series) => (
              <p key={series.key} className="mt-1 flex items-center gap-2">
                <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: series.color }} />
                <strong className="font-semibold text-ink">
                  {activePoint[series.key] !== null ? formatConcentration(activePoint[series.key] as number) : "—"}
                </strong>
                <span className="text-ink-subtle">{series.label}</span>
              </p>
            ))}
          </div>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {activePoint
            ? `Hour ending ${formatTimeIst(activePoint.iso)}: ${SERIES.map((s) => `${s.label} ${activePoint[s.key] !== null ? formatConcentration(activePoint[s.key] as number) : "not reported"}`).join(", ")} micrograms per cubic metre.`
            : ""}
        </p>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-primary">Show data table</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Hourly PM2.5 and PM10 at {stationName}</caption>
            <thead className="sticky top-0 bg-canvas text-ink-subtle">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Hour ending (IST)</th>
                <th scope="col" className="px-3 py-2 font-medium">PM2.5 (µg/m³)</th>
                <th scope="col" className="px-3 py-2 font-medium">PM10 (µg/m³)</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...points].reverse().map((p) => (
                <tr key={p.t} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 font-normal text-ink-muted">{formatTimeIst(p.iso)}</th>
                  <td className="px-3 py-1.5 text-ink">{p.pm25 !== null ? formatConcentration(p.pm25) : "—"}</td>
                  <td className="px-3 py-1.5 text-ink">{p.pm10 !== null ? formatConcentration(p.pm10) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
