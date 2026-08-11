"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ensureDefaultIcon } from "@/lib/leaflet-icon";

/**
 * Display-only map: a marker at a single location (a request's coordinates).
 * OpenStreetMap raster tiles — no API key, no geocoding, no search. Leaflet is
 * bundled from npm (not a CDN). If tiles fail to load the map degrades to a
 * blank canvas with the marker; the numeric distance chip elsewhere is the
 * dependency-free source of truth, so this is purely additive.
 */
export function MapView({
  lat,
  lng,
  className = "h-56 w-full rounded-xl",
}: {
  lat: number;
  lng: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Dynamic import keeps Leaflet out of the server bundle.
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      ensureDefaultIcon(L);
      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 14,
        scrollWheelZoom: false,
        attributionControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      markerRef.current = L.marker([lat, lng]).addTo(map);
      mapRef.current = map;
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the marker in sync if the coordinates change.
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng]);
    }
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      className={`${className} z-0 overflow-hidden bg-tile`}
      role="img"
      aria-label="מפת מיקום הבקשה"
    />
  );
}
