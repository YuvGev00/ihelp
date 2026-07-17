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

/**
 * Map overview of all open requests, above the feed cards — open by default.
 * A pine banner doubles as the section header and the collapse toggle.
 */
export function FeedMap({ pins }: { pins: MapPin[] }) {
  const [open, setOpen] = useState(true);
  if (!pins.length) return null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="relative flex w-full items-center justify-between overflow-hidden rounded-2xl bg-pine px-4 py-3.5 text-start text-white"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -start-3 -top-3 h-16 w-16 rounded-full bg-[#7fd6b6]/20"
        />
        <span className="relative">
          <span className="block font-bold">{S.requests.mapAllTitle}</span>
          <span className="mt-0.5 block text-xs text-[#7fd6b6]">
            {S.requests.mapCount(pins.length)}
          </span>
        </span>
        <span className="relative text-xl">{open ? "−" : "←"}</span>
      </button>
      {open && <RequestsMap pins={pins} />}
    </div>
  );
}
