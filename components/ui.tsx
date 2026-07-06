import { S } from "@/lib/strings";

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
      <span className="chip bg-emerald-100 text-emerald-800">
        {S.verification.verifiedIdentity} ✓
      </span>
      {professional && (
        <span className="chip bg-blue-100 text-blue-800">
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
    return <span className="text-xs text-stone-400">{S.helpers.noRatings}</span>;
  }
  const rounded = Math.round(value);
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <span className="text-amber-500" aria-label={`${value.toFixed(1)} ${S.lifecycle.stars}`}>
        {"★".repeat(rounded)}
        {"☆".repeat(5 - rounded)}
      </span>
      <span className="text-stone-600">{value.toFixed(1)}</span>
      {count !== undefined && (
        <span className="text-xs text-stone-400">({count})</span>
      )}
    </span>
  );
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800",
  has_offers: "bg-sky-100 text-sky-800",
  assigned: "bg-indigo-100 text-indigo-800",
  completed: "bg-stone-200 text-stone-700",
  rated: "bg-amber-100 text-amber-800",
  cancelled: "bg-red-100 text-red-700",
};

export function StatusChip({ status }: { status: string }) {
  return (
    <span className={`chip ${STATUS_STYLES[status] ?? "bg-stone-100 text-stone-600"}`}>
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
  return <span className="chip bg-stone-800 text-white">{S.requests.hidden}</span>;
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
      className={`chip ${isFree ? "bg-teal-100 text-teal-800" : "bg-amber-100 text-amber-800"}`}
    >
      {offerPriceText(offer)}
    </span>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card py-10 text-center text-stone-500">{message}</div>
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
