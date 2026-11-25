"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { categoryLabel, VERIFICATION_LABELS, VISIBLE_SEVERITY, type VisibleSeverity } from "@/features/civic-reports/constants";
import type { PublicReport } from "@/features/civic-reports/schemas";
import { cn } from "@/lib/utils/cn";
import { formatConcentration, formatDateTimeIst, formatTimeIst } from "@/lib/utils/format";

import { MEASURED_STALE_AFTER_HOURS } from "../../constants";
import { CPCB_AQI_CATEGORIES } from "../../cpcb-aqi-scale";
import type { AreaModelledOverview, StationOverview } from "../../services/area-air-quality";
import { ProvenanceBadge } from "../provenance-badge";

type Selection = { kind: "station"; id: string } | { kind: "area"; slug: string } | { kind: "report"; id: string } | null;

const NAVY = "#101b33";
const PRIMARY = "#2563eb";
const HOUR = 3_600_000;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function categoryOf(station: StationOverview) {
  return CPCB_AQI_CATEGORIES.find((c) => c.id === station.aqi?.category);
}

function aqiLabel(station: StationOverview) {
  return station.aqi ? `${station.aqi.value}${station.aqi.isLowerBound ? "+" : ""}` : "n/a";
}

/**
 * Interactive Jaipur map: monitoring stations (measured, Hawa AI-calculated
 * CPCB AQI), selectable areas, and an optional modelled PM2.5 layer.
 * Basemap © OpenStreetMap contributors.
 */
export function PollutionMap({
  stations,
  areas,
  reports,
  reportsUnavailable = false,
  initialReportId = null,
  generatedAt,
}: {
  stations: StationOverview[];
  areas: AreaModelledOverview[];
  reports: PublicReport[];
  reportsUnavailable?: boolean;
  initialReportId?: string | null;
  generatedAt: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const layersRef = useRef<{
    stations: Leaflet.LayerGroup;
    areas: Leaflet.LayerGroup;
    model: Leaflet.LayerGroup;
    reports: Leaflet.LayerGroup;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [showModel, setShowModel] = useState(false);
  const [showReports, setShowReports] = useState(true);
  const [selection, setSelection] = useState<Selection>(
    initialReportId && reports.some((r) => r.id === initialReportId) ? { kind: "report", id: initialReportId } : null,
  );

  const isStale = (observedAt: string | null) =>
    observedAt !== null && Date.parse(generatedAt) - Date.parse(observedAt) > MEASURED_STALE_AFTER_HOURS * HOUR;

  // Create the map once (Leaflet needs the browser, so it is loaded here).
  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        map = L.map(containerRef.current, { scrollWheelZoom: false, zoomSnap: 0.5 });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        const points = [...stations, ...areas].map((p) => L.latLng(p.latitude, p.longitude));
        if (points.length) map.fitBounds(L.latLngBounds(points).pad(0.12));
        layersRef.current = {
          stations: L.layerGroup().addTo(map),
          areas: L.layerGroup().addTo(map),
          model: L.layerGroup(),
          reports: L.layerGroup().addTo(map),
        };
        leafletRef.current = L;
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => setMapFailed(true));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [stations, areas]);

  // Draw markers for the current selection and layer choice.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!ready || !L || !map || !layers) return;
    layers.stations.clearLayers();
    layers.areas.clearLayers();
    layers.model.clearLayers();
    layers.reports.clearLayers();

    for (const report of reports) {
      const selected = selection?.kind === "report" && selection.id === report.id;
      L.marker([report.latitude, report.longitude], {
        title: `Community report: ${categoryLabel(report.category)}`,
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: selected ? 1000 : -100,
        icon: L.divIcon({
          className: "",
          iconAnchor: [9, 9],
          html: `<span class="hawa-report-marker${selected ? " hawa-report-marker--selected" : ""}"></span>`,
        }),
      })
        .on("click", () => setSelection({ kind: "report", id: report.id }))
        .addTo(layers.reports);
    }
    if (showReports) layers.reports.addTo(map);
    else layers.reports.remove();

    for (const area of areas) {
      const selected = selection?.kind === "area" && selection.slug === area.slug;
      L.circleMarker([area.latitude, area.longitude], {
        radius: selected ? 9 : 6,
        color: selected ? "#ffffff" : NAVY,
        weight: selected ? 3 : 2,
        fillColor: selected ? PRIMARY : "#ffffff",
        fillOpacity: 1,
      })
        .bindTooltip(escapeHtml(area.name), { direction: "top", offset: [0, -6] })
        .on("click", () => setSelection({ kind: "area", slug: area.slug }))
        .addTo(layers.areas);

      if (showModel && area.pm25) {
        L.marker([area.latitude, area.longitude], {
          icon: L.divIcon({
            className: "",
            html: `<span class="hawa-model-marker">~${escapeHtml(formatConcentration(area.pm25.value))}</span>`,
            iconAnchor: [-10, 22],
          }),
          interactive: false,
          keyboard: false,
        }).addTo(layers.model);
      }
    }

    for (const station of stations) {
      const category = categoryOf(station);
      const selected = selection?.kind === "station" && selection.id === station.id;
      const label = aqiLabel(station);
      L.marker([station.latitude, station.longitude], {
        title: `${station.name}: AQI ${label}${category ? ` (${category.label})` : ""}`,
        keyboard: true,
        riseOnHover: true,
        zIndexOffset: selected ? 1000 : 0,
        icon: L.divIcon({
          className: "",
          iconAnchor: [7, 7],
          html: `<span class="hawa-station-marker"><span class="hawa-station-marker__swatch" style="background:${
            category?.hex ?? "#ffffff"
          };${selected ? "outline:3px solid #2563eb;outline-offset:1px" : ""}"></span><span class="hawa-station-marker__label">${escapeHtml(label)}</span></span>`,
        }),
      })
        .on("click", () => setSelection({ kind: "station", id: station.id }))
        .addTo(layers.stations);
    }

    if (showModel) layers.model.addTo(map);
    else layers.model.remove();
  }, [ready, selection, showModel, showReports, stations, areas, reports]);

  // Keep the selected item in view.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !selection) return;
    const point =
      selection.kind === "station"
        ? stations.find((s) => s.id === selection.id)
        : selection.kind === "report"
          ? reports.find((r) => r.id === selection.id)
          : areas.find((a) => a.slug === selection.slug);
    if (point) map.panTo([point.latitude, point.longitude]);
  }, [ready, selection, stations, areas, reports]);

  const selectedStation = selection?.kind === "station" ? stations.find((s) => s.id === selection.id) : undefined;
  const selectedArea = selection?.kind === "area" ? areas.find((a) => a.slug === selection.slug) : undefined;
  const selectedReport = selection?.kind === "report" ? reports.find((r) => r.id === selection.id) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-card border border-line bg-surface px-4 py-3 shadow-card">
        <span className="text-sm font-medium text-ink">Layers</span>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked disabled className="size-4 accent-primary" />
          Monitoring stations <ProvenanceBadge kind="measured" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={showModel}
            onChange={(event) => setShowModel(event.target.checked)}
            className="size-4 accent-primary"
          />
          Model estimate, PM2.5 µg/m³ <ProvenanceBadge kind="modelled" />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={showReports}
            onChange={(event) => setShowReports(event.target.checked)}
            className="size-4 accent-primary"
          />
          Community reports ({reports.length}) <Badge tone="neutral">Unverified</Badge>
        </label>
        {reportsUnavailable ? <span className="text-xs text-ink-subtle">Reports could not be loaded.</span> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="relative isolate">
            <div
              ref={containerRef}
              role="region"
              aria-label="Map of Jaipur monitoring stations and areas. Use the tables below for the same information."
              className="h-[420px] w-full bg-canvas sm:h-[540px]"
            />
            {!ready && !mapFailed ? (
              <p className="absolute inset-0 grid place-items-center text-sm text-ink-subtle">Loading map…</p>
            ) : null}
            {mapFailed ? (
              <p role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-muted">
                The map could not be loaded. The station and area tables below show the same data.
              </p>
            ) : null}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={selectedStation ? "Monitoring station" : selectedArea ? "Area" : selectedReport ? "Community report" : "Details"}
          />
          <div className="p-5">
            {selectedReport ? (
              <ReportDetails report={selectedReport} />
            ) : selectedStation ? (
              <StationDetails station={selectedStation} areas={areas} stale={isStale(selectedStation.observedAt)} />
            ) : selectedArea ? (
              <AreaDetails area={selectedArea} stations={stations} />
            ) : (
              <p className="text-sm leading-6 text-ink-muted">
                Select a station, an area or a community report on the map, or in the tables below, to see its details.
              </p>
            )}
          </div>
        </Card>
      </div>

      <MapLegend />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Monitoring stations" description="Latest calculated CPCB AQI (measured)" />
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <thead className="text-xs text-ink-subtle">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Station</th>
                  <th scope="col" className="py-2 pr-3 font-medium">AQI</th>
                  <th scope="col" className="py-2 font-medium">Hour ending</th>
                </tr>
              </thead>
              <tbody>
                {stations.map((station) => (
                  <tr key={station.id} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "station", id: station.id })}
                        className="text-left font-medium text-primary hover:underline"
                      >
                        {station.name}
                      </button>
                    </th>
                    <td className="py-2 pr-3 text-ink tabular-nums">
                      {aqiLabel(station)}
                      <span className="ml-1.5 text-xs text-ink-subtle">{categoryOf(station)?.label ?? ""}</span>
                    </td>
                    <td className="py-2 text-ink-muted">
                      {station.observedAt ? formatTimeIst(station.observedAt) : "—"}
                      {isStale(station.observedAt) ? (
                        <span className="ml-1.5">
                          <Badge tone="warning">Stale</Badge>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Areas" description="Model estimate for each area's grid cell (not measured)" />
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead className="text-xs text-ink-subtle">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Area</th>
                  <th scope="col" className="py-2 font-medium">Modelled PM2.5</th>
                </tr>
              </thead>
              <tbody>
                {areas.map((area) => (
                  <tr key={area.slug} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "area", slug: area.slug })}
                        className="text-left font-medium text-primary hover:underline"
                      >
                        {area.name}
                      </button>
                    </th>
                    <td className="py-2 text-ink-muted tabular-nums">
                      {area.pm25 ? `${formatConcentration(area.pm25.value)} µg/m³` : "Not available"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {reports.length ? (
        <Card>
          <CardHeader
            title="Community reports"
            description="Unverified submissions; locations rounded to about 110 m. Not official complaints."
          />
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full min-w-[22rem] text-left text-sm">
              <thead className="text-xs text-ink-subtle">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Category</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Reported</th>
                  <th scope="col" className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.slice(0, 20).map((report) => (
                  <tr key={report.id} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "report", id: report.id })}
                        className="text-left font-medium text-primary hover:underline"
                      >
                        {categoryLabel(report.category)}
                      </button>
                    </th>
                    <td className="py-2 pr-3 text-ink-muted">{formatDateTimeIst(report.createdAt)}</td>
                    <td className="py-2 text-ink-muted">{VERIFICATION_LABELS[report.verificationStatus] ?? report.verificationStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function ReportDetails({ report }: { report: PublicReport }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-ink">{categoryLabel(report.category)}</h3>
        <Badge tone={report.verificationStatus === "verified" ? "success" : "neutral"}>
          {VERIFICATION_LABELS[report.verificationStatus] ?? report.verificationStatus}
        </Badge>
      </div>
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-subtle">Reported</dt>
          <dd className="text-right text-ink">{formatDateTimeIst(report.createdAt)}</dd>
        </div>
        {report.aiCategory ? (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-subtle">AI reading of photo</dt>
            <dd className="text-right text-ink">
              {categoryLabel(report.aiCategory)}
              {report.aiConfidence !== null ? ` · ${Math.round(report.aiConfidence * 100)}%` : ""}
            </dd>
          </div>
        ) : null}
        {report.visibleSeverity ? (
          <div className="flex justify-between gap-3">
            <dt className="text-ink-subtle">Visible intensity</dt>
            <dd className="text-right text-ink">{VISIBLE_SEVERITY[report.visibleSeverity as VisibleSeverity] ?? "Unclear"}</dd>
          </div>
        ) : null}
      </dl>
      <p className="flex gap-2 text-xs leading-5 text-ink-subtle">
        <Icon name="info" size={14} className="mt-0.5 shrink-0" />
        A community submission, not an official complaint and not a measurement. The AI confidence is the model&apos;s own
        estimate. Location rounded to about 110 m; the photo is not published.
      </p>
    </div>
  );
}

function StationDetails({
  station,
  areas,
  stale,
}: {
  station: StationOverview;
  areas: AreaModelledOverview[];
  stale: boolean;
}) {
  const category = categoryOf(station);
  const nearestArea = [...areas].sort((a, b) => distanceKm(station, a) - distanceKm(station, b))[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-ink">{station.name}</h3>
        <ProvenanceBadge kind="measured" />
      </div>
      {station.aqi && category ? (
        <div className="flex items-end gap-3">
          <span className="text-4xl leading-none font-semibold text-ink">{aqiLabel(station)}</span>
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", category.chipClass)}>
            {category.label}
          </span>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">No calculated AQI for the latest hours.</p>
      )}
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-ink-subtle">Hour ending</dt>
          <dd className="flex items-center gap-2 text-ink">
            {station.observedAt ? formatTimeIst(station.observedAt) : "—"}
            {stale ? <Badge tone="warning">Stale</Badge> : null}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-ink-subtle">Network</dt>
          <dd className="text-right text-ink">{[station.network, station.operator].filter(Boolean).join(" / ") || "—"}</dd>
        </div>
      </dl>
      <p className="flex gap-2 text-xs leading-5 text-ink-subtle">
        <Icon name="info" size={14} className="mt-0.5 shrink-0" />
        AQI calculated by Hawa AI from this station&apos;s measurements (CPCB method), via OpenAQ.
      </p>
      {nearestArea ? (
        <ButtonLink href={`/dashboard?location=${encodeURIComponent(nearestArea.slug)}`} variant="secondary" size="sm">
          Open {nearestArea.name} on the dashboard
        </ButtonLink>
      ) : null}
    </div>
  );
}

function AreaDetails({ area, stations }: { area: AreaModelledOverview; stations: StationOverview[] }) {
  const nearest = [...stations]
    .map((station) => ({ station, km: distanceKm(area, station) }))
    .sort((a, b) => a.km - b.km)[0];
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-semibold text-ink">{area.name}</h3>
      <div className="flex flex-col gap-1">
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-subtle">
          Model estimate <ProvenanceBadge kind="modelled" />
        </span>
        <span className="text-sm text-ink">
          {area.pm25
            ? `PM2.5 ${formatConcentration(area.pm25.value)} µg/m³ at ${formatTimeIst(area.pm25.observedAt)}`
            : "Not available"}
        </span>
        <span className="text-xs text-ink-subtle">Model estimates have read well below Jaipur&apos;s stations.</span>
      </div>
      {nearest ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-ink-subtle">Nearest monitoring station</span>
          <span className="text-sm text-ink">
            {nearest.station.name} · {nearest.km.toFixed(1)} km · AQI {aqiLabel(nearest.station)}
          </span>
        </div>
      ) : null}
      <p className="text-xs text-ink-subtle">Areas are interface locations, not monitoring stations.</p>
      <ButtonLink href={`/dashboard?location=${encodeURIComponent(area.slug)}`} size="sm">
        Open dashboard for {area.name}
      </ButtonLink>
    </div>
  );
}

function MapLegend() {
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted" aria-label="Map key">
        {CPCB_AQI_CATEGORIES.map((category) => (
          <li key={category.id} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-3 rounded-[3px]", category.swatchClass)} />
            {category.label} ({category.min}–{category.max})
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="size-3 rounded-full border-2 border-navy bg-surface" />
          Area (select to view)
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="rounded-full border border-dashed border-primary px-1 text-[10px] text-primary-strong">~25</span>
          Model PM2.5 estimate
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="hawa-report-marker hawa-report-marker--legend" />
          Community report (unverified)
        </li>
      </ul>
      <p className="text-xs text-ink-subtle">
        Station colours use the CPCB AQI calculated by Hawa AI. Basemap © OpenStreetMap contributors.
      </p>
    </div>
  );
}
