import { S } from "@/lib/strings";
import { categoryLabel } from "@/lib/categories";

/** The public URL of an avatar object (public bucket) — or null. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/avatars/${path}`;
}

/** Round avatar with an initials fallback when no picture is set. */
export function Avatar({
  name,
  path,
  size = 40,
}: {
  name: string;
  path?: string | null;
  size?: number;
}) {
  const url = avatarUrl(path);
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
  const dim = { width: size, height: size };
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name}
        style={dim}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      style={dim}
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-mint font-bold text-brand"
    >
      {initial}
    </span>
  );
}

/** Verification badges shown wherever a helper appears (trust signals). */
export function Badge({
  verified,
  professional,
}: {
  verified?: boolean;
  professional?: boolean;
}) {
  if (!verified) return null;
  return (
    <span className="inline-flex gap-1">
      <span className="chip bg-mint text-brand">
        {S.verification.verifiedIdentity} ✓
      </span>
      {professional && (
        <span className="chip bg-pro-bg text-pro">
          {S.verification.professionalBadge}
        </span>
      )}
    </span>
  );
}

/** Read-only star display with optional count. */
export function Stars({
  value,
  count,
}: {
  value: number | null;
  count?: number;
}) {
  if (value === null || count === 0) {
    return <span className="text-xs text-muted">{S.helpers.noRatings}</span>;
  }
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span
        className="text-star"
        role="img"
        aria-label={`${value.toFixed(1)} ${S.lifecycle.stars}`}
      >
        {"★".repeat(rounded)}
        {"☆".repeat(5 - rounded)}
      </span>
      <span className="font-bold text-body">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-xs text-muted">({count})</span>
      )}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-mint text-brand",
  has_offers: "bg-sky-100 text-sky-800",
  assigned: "bg-[#eef2ff] text-[#4f5bd5]",
  completed: "bg-tint text-body",
  rated: "bg-price-bg text-price",
  cancelled: "bg-red-100 text-red-700",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip gap-1 ${STATUS_STYLES[status] ?? "bg-tint text-body"}`}>
      <span aria-hidden className="text-[8px] leading-none">●</span>
      {S.requests.status[status] ?? status}
    </span>
  );
}

/**
 * Status as a non-owner sees it. How many offers a request has is the
 * requester's private information (sealed bids) — a browsing helper must not
 * learn it, so `has_offers` reads as plain "open". Only the owner (and admin)
 * see the true `has_offers` state.
 */
export function PublicStatusChip({ status }: { status: string }) {
  return <StatusChip status={status === "has_offers" ? "open" : status} />;
}

/** Shown to the owner/admin on a moderated request (invisible to browsers). */
export function HiddenChip() {
  return <span className="chip bg-ink text-white">{S.requests.hidden}</span>;
}

type OfferPricing = {
  pricing_mode: "fixed" | "volunteer" | "after_job";
  price: number | null;
  final_price: number | null;
};

/** The human-readable price of an offer across the three stances. */
export function offerPriceText(o: OfferPricing): string {
  if (o.pricing_mode === "volunteer") return S.offers.freeOffer;
  if (o.pricing_mode === "fixed") return `₪${o.price}`;
  // after_job: final price if set, otherwise "to be determined"
  return o.final_price != null ? `₪${o.final_price}` : S.offers.priceTBD;
}

/** Chip form of the above, colored by whether money is involved. */
export function OfferPriceChip({ offer }: { offer: OfferPricing }) {
  const isFree = offer.pricing_mode === "volunteer";
  return (
    <span
      className={`chip ${isFree ? "bg-mint text-brand" : "bg-price-bg text-price"}`}
    >
      {offerPriceText(offer)}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card py-10 text-center text-muted">{message}</div>
  );
}

/** A compact stat tile: a big number over a label (jobs, ratings). */
export function StatChip({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl bg-mint px-3 py-2.5 text-center">
      <div className="text-xl font-extrabold text-pine">{value}</div>
      <div className="text-[11px] font-semibold text-[#3f7d68]">{label}</div>
    </div>
  );
}

/** 5→1 star-distribution histogram (share bar + count per level). */
export function RatingBars({
  distribution,
  total,
}: {
  distribution: Record<string, number>; // { "5": n, ... }
  total: number;
}) {
  if (!total) return null;
  return (
    <div className="space-y-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = distribution[String(star)] ?? 0;
        const pct = Math.round((n / total) * 100);
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="w-8 shrink-0 font-semibold text-body">
              {star} ★
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-star"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-6 shrink-0 text-start text-muted">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Category-expertise chips: "חשמל · 8". */
export function CategoryChips({ categories }: { categories: Record<string, number> }) {
  const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([key, count]) => (
        <span key={key} className="chip bg-tint text-body">
          {categoryLabel(key)} · {count}
        </span>
      ))}
    </div>
  );
}

/** he-IL date — pinned to Israel time; the server (Vercel) runs in UTC. */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
}
