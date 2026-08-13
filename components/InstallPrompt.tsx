"use client";

import { useEffect, useState } from "react";
import { S } from "@/lib/strings";

/**
 * "Add to Home Screen" nudge — surfaces the app's existing installability.
 *
 * Two platforms, two paths (no single API covers both in 2026):
 * - Chromium fires `beforeinstallprompt`; we stash it and call prompt() on tap.
 * - iOS Safari never fires it and stays manual, so we show a short hint
 *   pointing at the share menu.
 *
 * All UI is hidden when the app is already running installed (standalone), so
 * installed users never see it.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag when launched from the home screen
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Computed once on mount (lazy init) — avoids setState-in-effect.
  const [ios] = useState(isIos);
  const [standalone] = useState(isStandalone);

  useEffect(() => {
    if (isStandalone()) return; // already installed → listen to nothing

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferred(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed || dismissed) return null;

  const canPrompt = deferred !== null;
  const iosFallback = ios && !canPrompt;
  if (!canPrompt && !iosFallback) return null; // nothing installable to show

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return (
    <section className="rounded-2xl border border-mint-border bg-mint p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl leading-none">📲</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-pine">{S.install.prompt}</p>
          {iosFallback ? (
            <p className="mt-1 text-xs text-[#3f7d68]">{S.install.iosHint}</p>
          ) : (
            <button onClick={install} className="btn-primary mt-2">
              {S.install.cta}
            </button>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-muted hover:text-ink"
          aria-label={S.install.dismiss}
        >
          ✕
        </button>
      </div>
    </section>
  );
}
