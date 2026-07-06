"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapPin } from "@/components/RequestsMap";
import { S } from "@/lib/strings";

// Leaflet is client-only; load the map lazily and only when opened.
const RequestsMap = dynamic(
  () => import("@/components/RequestsMap").then((m) => m.RequestsMap),
  { ssr: false }
);

/** Map overview of all open requests, above the feed cards — open by default. */
export function FeedMap({ pins }: { pins: MapPin[] }) {
  const [open, setOpen] = useState(true);
  if (!pins.length) return null;

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-secondary"
        aria-expanded={open}
      >
        {open ? S.requests.hideMap : `${S.requests.showMap} (${pins.length})`}
      </button>
      {open && <RequestsMap pins={pins} />}
    </div>
  );
}
