"use client";

import { useState, useTransition } from "react";
import { updateLocation } from "@/actions/profile";
import { S } from "@/lib/strings";

/**
 * One-time browser geolocation capture (spec §8.1). The captured value is
 * persisted via a server action and discarded client-side — the server row is
 * the source of truth. Denial is a normal state, not an error (C4 fallback).
 */
export function GeolocationPrompt({ hasLocation }: { hasLocation: boolean }) {
  const [status, setStatus] = useState<"idle" | "denied" | "saved">("idle");
  const [pending, startTransition] = useTransition();

  function capture() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        startTransition(async () => {
          const result = await updateLocation(
            pos.coords.latitude,
            pos.coords.longitude
          );
          setStatus(result.ok ? "saved" : "idle");
        });
      },
      () => setStatus("denied"),
      { enableHighAccuracy: false, timeout: 10_000 }
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-stone-600">
        {hasLocation || status === "saved"
          ? S.profile.locationSet
          : S.profile.locationUnset}
      </p>
      <button
        type="button"
        onClick={capture}
        disabled={pending}
        className="btn-secondary"
      >
        {pending ? S.common.loading : S.profile.captureLocation}
      </button>
      {status === "denied" && (
        <p className="text-sm text-amber-700">{S.profile.locationDenied}</p>
      )}
    </div>
  );
}
