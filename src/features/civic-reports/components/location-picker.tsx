"use client";

import "leaflet/dist/leaflet.css";

import type * as Leaflet from "leaflet";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

import { isInJaipurArea, JAIPUR_BOUNDS, roundCoordinate } from "../constants";

export type PickedLocation = { latitude: number; longitude: number; source: "map" | "device" | "area" };
type Area = { slug: string; name: string; latitude: number; longitude: number };

const CENTRE: [number, number] = [26.9124, 75.7873];

/**
 * Pin a location by tapping the map, using the device location, or choosing
 * an area (keyboard and screen-reader friendly). Coordinates are rounded to
 * about 110 m before they leave the browser.
 */
export function LocationPicker({
  areas,
  value,
  onChange,
}: {
  areas: Area[];
  value: PickedLocation | null;
  onChange: (location: PickedLocation | null) => void;
}) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Leaflet.Map | null>(null);
  const markerRef = useRef<Leaflet.Marker | null>(null);
  const leafletRef = useRef<typeof Leaflet | null>(null);
  const onChangeRef = useRef(onChange);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const set = (latitude: number, longitude: number, source: PickedLocation["source"]) => {
    if (!isInJaipurArea(latitude, longitude)) {
      setMessage("That point is outside the Jaipur area. Place the pin within Jaipur.");
      return;
    }
    setMessage(null);
    onChangeRef.current({ latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude), source });
  };
  const setRef = useRef(set);
  useEffect(() => {
    setRef.current = set;
  });

  useEffect(() => {
    let cancelled = false;
    let map: Leaflet.Map | undefined;
    import("leaflet")
      .then((L) => {
        if (cancelled || !containerRef.current) return;
        map = L.map(containerRef.current, {
          scrollWheelZoom: false,
          zoomSnap: 0.5,
          maxBounds: L.latLngBounds([JAIPUR_BOUNDS.south, JAIPUR_BOUNDS.west], [JAIPUR_BOUNDS.north, JAIPUR_BOUNDS.east]),
        }).setView(CENTRE, 12);
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        }).addTo(map);
        map.on("click", (event: Leaflet.LeafletMouseEvent) => setRef.current(event.latlng.lat, event.latlng.lng, "map"));
        leafletRef.current = L;
        mapRef.current = map;
        setReady(true);
      })
      .catch(() => setMessage("The map could not be loaded. Use your location or choose an area instead."));
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!value) return;
    markerRef.current = L.marker([value.latitude, value.longitude], {
      title: "Report location",
      keyboard: false,
      icon: L.divIcon({ className: "", iconAnchor: [9, 9], html: '<span class="hawa-report-marker hawa-report-marker--selected"></span>' }),
    }).addTo(map);
    if (value.source !== "map") map.setView([value.latitude, value.longitude], 15);
  }, [ready, value]);

  const useDevice = () => {
    if (!("geolocation" in navigator)) {
      setMessage("Location is not available in this browser. Tap the map or choose an area.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        set(position.coords.latitude, position.coords.longitude, "device");
      },
      () => {
        setLocating(false);
        setMessage("Your location could not be read. Tap the map or choose an area.");
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={useDevice} disabled={locating}>
          <Icon name="pin" size={14} />
          {locating ? "Finding you…" : "Use my location"}
        </Button>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-area`} className="text-xs font-medium text-ink-muted">
            Or choose an area
          </label>
          <select
            id={`${id}-area`}
            className="h-8 rounded-lg border border-line-control bg-surface px-2 text-sm text-ink"
            value=""
            onChange={(event) => {
              const area = areas.find((a) => a.slug === event.target.value);
              if (area) set(area.latitude, area.longitude, "area");
            }}
          >
            <option value="">Select…</option>
            {areas.map((area) => (
              <option key={area.slug} value={area.slug}>
                {area.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="relative isolate overflow-hidden rounded-lg border border-line">
        <div
          ref={containerRef}
          role="region"
          aria-label="Map for choosing the report location. Tap or click to place the pin; keyboard users can use the location button or the area list."
          className="h-64 w-full bg-canvas sm:h-80"
        />
        {!ready ? <p className="absolute inset-0 grid place-items-center text-sm text-ink-subtle">Loading map…</p> : null}
      </div>
      <p className="text-xs text-ink-subtle" aria-live="polite">
        {message ? (
          <span className="text-red-700">{message}</span>
        ) : value ? (
          `Pinned at ${value.latitude.toFixed(3)}, ${value.longitude.toFixed(3)} (rounded to about 110 m).`
        ) : (
          "Tap the map where you saw the pollution."
        )}
      </p>
    </div>
  );
}
