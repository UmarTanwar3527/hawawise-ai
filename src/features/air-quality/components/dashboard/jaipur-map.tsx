"use client";

import { useRouter } from "next/navigation";

import { useElementWidth } from "@/lib/hooks/use-element-width";
import { cn } from "@/lib/utils/cn";
import { formatTimeIst } from "@/lib/utils/format";

import { CPCB_AQI_CATEGORIES } from "../../cpcb-aqi-scale";
import { MEASURED_STALE_AFTER_HOURS } from "../../constants";
import type { AreaSummary, StationOverview } from "../../services/area-air-quality";

const PADDING = 36;

/**
 * Schematic map: positions are to scale (equirectangular, corrected for
 * latitude) but there is no basemap. Stations carry their calculated AQI;
 * areas are interface locations, not monitors.
 */
export function JaipurMap({
  areas,
  stations,
  selectedSlug,
  generatedAt,
}: {
  areas: AreaSummary[];
  stations: StationOverview[];
  selectedSlug: string;
  /** Server time the data was read; used for staleness without hydration drift. */
  generatedAt: string;
}) {
  const router = useRouter();
  const { ref, width } = useElementWidth<HTMLDivElement>(640);

  const all = [...areas, ...stations];
  const lats = all.map((p) => p.latitude);
  const lngs = all.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const kx = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  const geoWidth = Math.max((maxLng - minLng) * kx, 0.01);
  const geoHeight = Math.max(maxLat - minLat, 0.01);
  const innerWidth = Math.max(width - PADDING * 2, 100);
  const scale = Math.min(innerWidth / geoWidth, 340 / geoHeight);
  const height = Math.round(geoHeight * scale + PADDING * 2);
  const offsetX = (width - geoWidth * scale) / 2;

  const project = (lat: number, lng: number) => ({
    x: offsetX + (lng - minLng) * kx * scale,
    y: PADDING + (maxLat - lat) * scale,
  });
  const kmPx = scale / 111.2; // pixels per km (1° latitude ≈ 111.2 km)

  const areaPoints = areas.map((area) => project(area.latitude, area.longitude));
  /** First label position (right, left, above) whose box has no area marker in it. */
  const labelPlacement = (x: number, y: number) => {
    const candidates = [
      { x: x + 10, y, anchor: "start" as const, box: [x + 2, x + 44, y - 10, y + 10] as const },
      { x: x - 10, y, anchor: "end" as const, box: [x - 44, x - 2, y - 10, y + 10] as const },
      { x, y: y - 14, anchor: "middle" as const, box: [x - 20, x + 20, y - 24, y - 6] as const },
    ];
    const clear = candidates.find(({ box: [x1, x2, y1, y2] }) =>
      areaPoints.every((p) => p.x < x1 || p.x > x2 || p.y < y1 || p.y > y2),
    );
    return clear ?? candidates[0]!;
  };
  const isStale = (observedAt: string | null) =>
    observedAt !== null &&
    Date.parse(generatedAt) - Date.parse(observedAt) > MEASURED_STALE_AFTER_HOURS * 3_600_000;

  const go = (slug: string) => router.push(`/dashboard?location=${encodeURIComponent(slug)}`);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
      <div className="flex flex-col gap-3">
        <div ref={ref} className="overflow-hidden rounded-xl border border-line bg-canvas">
          <svg width={width} height={height} className="block max-w-full" aria-labelledby="map-title map-desc" role="group">
            <title id="map-title">Schematic map of Jaipur monitoring stations and areas</title>
            <desc id="map-desc">
              {stations.length} monitoring stations coloured by calculated CPCB AQI category, and {areas.length} selectable
              areas. A table of station values follows the map.
            </desc>

            {/* Scale bar: 5 km */}
            <g transform={`translate(${PADDING}, ${height - 14})`}>
              <line x1={0} x2={5 * kmPx} y1={0} y2={0} stroke="var(--color-ink-subtle)" strokeWidth={1} />
              <text x={5 * kmPx + 6} y={0} dy="0.32em" className="fill-ink-subtle text-[10px]">5 km</text>
            </g>

            {areas.map((area) => {
              const { x, y } = project(area.latitude, area.longitude);
              const selected = area.slug === selectedSlug;
              return (
                <a
                  key={area.slug}
                  href={`/dashboard?location=${encodeURIComponent(area.slug)}`}
                  aria-label={`Show ${area.name}`}
                  aria-current={selected ? "page" : undefined}
                  className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-primary"
                  onClick={(event) => {
                    // Keep new-tab and modified clicks native; plain clicks navigate client-side.
                    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                    event.preventDefault();
                    go(area.slug);
                  }}
                >
                  <title>{area.name}</title>
                  <circle cx={x} cy={y} r={12} fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={selected ? 7 : 5}
                    className={cn(selected ? "fill-primary" : "fill-surface")}
                    stroke={selected ? "var(--color-surface)" : "var(--color-navy)"}
                    strokeWidth={selected ? 3 : 1.5}
                  />
                  {selected ? (
                    <text
                      x={x}
                      y={y - 14}
                      textAnchor="middle"
                      className="fill-ink text-[12px] font-semibold"
                      stroke="var(--color-canvas)"
                      strokeWidth={4}
                      paintOrder="stroke"
                    >
                      {area.name}
                    </text>
                  ) : null}
                </a>
              );
            })}

            {stations.map((station) => {
              const { x, y } = project(station.latitude, station.longitude);
              const category = station.aqi
                ? CPCB_AQI_CATEGORIES.find((c) => c.id === station.aqi?.category)
                : undefined;
              const label = station.aqi ? `${station.aqi.value}${station.aqi.isLowerBound ? "+" : ""}` : "n/a";
              const placement = labelPlacement(x, y);
              return (
                <g key={station.id}>
                  <title>
                    {`${station.name}: ${station.aqi ? `AQI ${label} (${category?.label ?? "unknown"})` : "no AQI"}`}
                  </title>
                  <rect
                    x={x - 6}
                    y={y - 6}
                    width={12}
                    height={12}
                    rx={3}
                    className={category?.fillClass ?? "fill-surface"}
                    stroke={category ? "var(--color-surface)" : "var(--color-ink-subtle)"}
                    strokeWidth={2}
                  />
                  <text
                    x={placement.x}
                    y={placement.y}
                    dy="0.32em"
                    textAnchor={placement.anchor}
                    className="fill-ink text-[11px] font-semibold tabular-nums"
                    stroke="var(--color-canvas)"
                    strokeWidth={4}
                    paintOrder="stroke"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted" aria-label="Map key">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-[3px] bg-poor" />
            Monitoring station (colour = calculated CPCB category, number = AQI)
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-full border-[1.5px] border-navy bg-surface" />
            Area (select to view)
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[22rem] text-left text-xs">
          <caption className="sr-only">Monitoring stations and their latest calculated CPCB AQI</caption>
          <thead className="bg-canvas text-ink-subtle">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Station</th>
              <th scope="col" className="px-3 py-2 font-medium">AQI</th>
              <th scope="col" className="px-3 py-2 font-medium">Category</th>
              <th scope="col" className="px-3 py-2 font-medium">Hour ending</th>
            </tr>
          </thead>
          <tbody>
            {stations.map((station) => {
              const category = CPCB_AQI_CATEGORIES.find((c) => c.id === station.aqi?.category);
              return (
                <tr key={station.id} className="border-t border-line">
                  <th scope="row" className="px-3 py-1.5 font-medium text-ink">{station.name}</th>
                  <td className="px-3 py-1.5 tabular-nums text-ink">
                    {station.aqi ? `${station.aqi.value}${station.aqi.isLowerBound ? "+" : ""}` : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-ink-muted">{category?.label ?? "Not available"}</td>
                  <td className="px-3 py-1.5 text-ink-muted">
                    {station.observedAt ? formatTimeIst(station.observedAt) : "—"}
                    {isStale(station.observedAt) ? (
                      <span className="ml-1.5 rounded-full border border-yellow-200 bg-yellow-50 px-1.5 py-0.5 text-[10px] font-medium text-yellow-800">
                        Stale
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
