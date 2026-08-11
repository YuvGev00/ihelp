"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ensureDefaultIcon } from "@/lib/leaflet-icon";
import { S } from "@/lib/strings";

/**
 * Click-to-place location picker for the request form — an alternative to the
 * browser-GPS capture for a requester who declines geolocation or wants to
 * pin a different spot. Display + click only; no address search / geocoding.
 * Reports the chosen coordinates upward via onChange.
 */
export function MapPicker({
  initial,
  onChange,
}: {
  initial: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  // Default view: Tel Aviv, a sensible center for the Israeli audience.
  const center = initial ?? { lat: 32.0853, lng: 34.7818 };

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      ensureDefaultIcon(L);
      const map = L.map(containerRef.current, {
        center: [center.lat, center.lng],
        zoom: initial ? 15 : 12,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const placeMarker = (lat: number, lng: number) => {
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
        else markerRef.current = L.marker([lat, lng]).addTo(map);
      };
      // Initial pin is display-only — do NOT fire onChange (the parent already
      // holds this value; firing it would loop with the map-sync effect below).
      if (initial) placeMarker(initial.lat, initial.lng);
      // A user click is a real choice → move the pin AND report it.
      map.on("click", (e) => {
        placeMarker(e.latlng.lat, e.latlng.lng);
        onChange({ lat: e.latlng.lat, lng: e.latlng.lng });
      });

      mapRef.current = map;
      setReady(true);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the pin in sync when the parent changes `initial` after mount
  // (e.g. the GPS "confirm current location" button). Display-only: no onChange.
  useEffect(() => {
    let cancelled = false;
    if (!initial || !mapRef.current) return;
    import("leaflet").then((L) => {
      const map = mapRef.current;
      if (cancelled || !map) return;
      if (markerRef.current) markerRef.current.setLatLng([initial.lat, initial.lng]);
      else markerRef.current = L.marker([initial.lat, initial.lng]).addTo(map);
      map.setView([initial.lat, initial.lng], 15);
    });
    return () => {
      cancelled = true;
    };
  }, [initial?.lat, initial?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div
        ref={containerRef}
        className="z-0 h-56 w-full overflow-hidden rounded-xl bg-[#f2f5f4]"
      />
      {ready && (
        <p className="mt-1 text-xs text-muted">{S.requests.mapPickerHint}</p>
      )}
    </div>
  );
}
