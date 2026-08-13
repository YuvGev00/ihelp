"use client";

import { useState } from "react";
import { S } from "@/lib/strings";

/**
 * Share the current request via the OS share sheet (Web Share API), falling
 * back to copying the link. Zero dependency; the raw API is a few lines.
 *
 * - Feature-detected at call time (navigator.share is absent on Firefox
 *   desktop and Chrome-on-Linux), so no SSR access to `navigator`.
 * - AbortError (user dismissed the sheet) is swallowed silently — it is not a
 *   failure.
 * - Clipboard fallback shows a brief inline "link copied" confirmation, so no
 *   app-wide toast system is needed.
 */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = window.location.href;
    const data = { title, text: S.common.shareRequestText, url };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(data);
      } catch (err) {
        // User closed the sheet — not an error worth surfacing.
        if ((err as Error)?.name !== "AbortError") {
          void copyLink(url);
        }
      }
      return;
    }
    void copyLink(url);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (rare) — nothing more we can gracefully do.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="chip gap-1.5 border border-line bg-white text-body hover:border-brand/40"
      aria-label={S.common.share}
    >
      {copied ? (
        <span className="text-brand">{S.common.linkCopied}</span>
      ) : (
        <>
          <span aria-hidden>↗</span>
          {S.common.share}
        </>
      )}
    </button>
  );
}
