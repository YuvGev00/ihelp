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

      const place = (lat: number, lng: number) => {
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
        else markerRef.current = L.marker([lat, lng]).addTo(map);
        onChange({ lat, lng });
      };
      if (initial) place(initial.lat, initial.lng);
      map.on("click", (e) => place(e.latlng.lat, e.latlng.lng));

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
