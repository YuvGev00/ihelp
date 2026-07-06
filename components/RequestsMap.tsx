"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import "leaflet/dist/leaflet.css";
import { ensureDefaultIcon } from "@/lib/leaflet-icon";
import { S } from "@/lib/strings";

export type MapPin = {
  id: string;
  title: string;
  category: string; // already-localized label
  distanceText: string | null; // "2.4 ק"מ ממך" or null
  lat: number;
  lng: number;
};

/**
 * Feed map: one marker per open request. Clicking a marker opens a popup with a
 * request summary and a link to its page; hovering opens the same popup. Pins
 * fit the view to the requests. Display-only OpenStreetMap, no geocoding.
 */
export function RequestsMap({ pins }: { pins: MapPin[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const router = useRouter();

  const renderPins = useCallback(
    (L: typeof import("leaflet")) => {
      const map = mapRef.current;
      const layer = layerRef.current;
      if (!map || !layer) return;
      layer.clearLayers();

      if (!pins.length) {
        map.setView([32.0853, 34.7818], 12); // Tel Aviv fallback
        return;
      }

      const bounds = L.latLngBounds([]);
      for (const p of pins) {
        const html = `
          <div dir="rtl" style="min-width:160px">
            <strong>${escapeHtml(p.title)}</strong><br/>
            <span style="color:#57534e">${escapeHtml(p.category)}</span><br/>
            ${p.distanceText ? `<span style="color:#78716c;font-size:12px">${escapeHtml(p.distanceText)}</span><br/>` : ""}
            <a href="/requests/${p.id}" style="color:#047857;font-weight:600">${S.requests.viewRequest} ←</a>
          </div>`;
        const marker = L.marker([p.lat, p.lng]).bindPopup(html);
        marker.on("mouseover", () => marker.openPopup());
        marker.on("mouseout", () => marker.closePopup());
        marker.on("click", () => router.push(`/requests/${p.id}`));
        layer.addLayer(marker);
        bounds.extend([p.lat, p.lng]);
      }
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    },
    [pins, router]
  );

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      ensureDefaultIcon(L);
      const map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      renderPins(L);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [renderPins]);

  // Re-render markers when the pin set changes (filters/pagination).
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((L) => renderPins(L));
  }, [renderPins]);

  return (
    <div
      ref={containerRef}
      className="z-0 h-72 w-full overflow-hidden rounded-xl bg-stone-100"
      role="img"
      aria-label={S.requests.mapAllTitle}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
