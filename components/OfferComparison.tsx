"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  Avatar,
  Badge,
  Stars,
  OfferPriceChip,
  offerPriceText,
} from "@/components/ui";
import { AssignButton } from "@/components/LifecycleActions";
import { S } from "@/lib/strings";

export type ComparableOffer = {
  id: string;
  helper_id: string;
  status: string;
  message: string;
  pricing_mode: "fixed" | "volunteer" | "after_job";
  price: number | null;
  final_price: number | null;
  created_at: string;
  helper: {
    display_name: string | null;
    avatar_path: string | null;
    is_identity_verified: boolean;
    is_professional: boolean;
  } | null;
  rating: { avg: number; count: number } | null;
};

type Sort = "price" | "rating" | "newest";
type Filter = "all" | "volunteers" | "fixed" | "pros";

/** Numeric price used for sorting: volunteers sort as 0, unset after_job as +∞
 *  (unknown price goes last when sorting cheapest-first). */
function sortablePrice(o: ComparableOffer): number {
  if (o.pricing_mode === "volunteer") return 0;
  if (o.pricing_mode === "fixed") return o.price ?? Infinity;
  return o.final_price ?? Infinity; // after_job, price not yet set
}

/**
 * The requester's decision surface — the climax of the reversed marketplace.
 * Turns a flat created_at-ordered list into a comparison tool: sort, filter,
 * a summary line, and an explicit pricing-stance label on every offer so the
 * three stances are legible at a glance rather than implied by chip color.
 * All data arrives as plain props (already fetched server-side); this component
 * adds no queries and no new security surface.
 */
export function OfferComparison({
  requestId,
  offers,
  canAssign,
}: {
  requestId: string;
  offers: ComparableOffer[];
  canAssign: boolean; // request is in has_offers → the owner may pick
}) {
  const [sort, setSort] = useState<Sort>("newest");
  const [filter, setFilter] = useState<Filter>("all");

  const summary = useMemo(() => {
    const priced = offers
      .map((o) => (o.pricing_mode === "fixed" ? o.price : o.final_price))
      .filter((p): p is number => p != null);
    const volunteers = offers.filter(
      (o) => o.pricing_mode === "volunteer"
    ).length;
    return {
      min: priced.length ? Math.min(...priced) : null,
      max: priced.length ? Math.max(...priced) : null,
      volunteers,
    };
  }, [offers]);

  const shown = useMemo(() => {
    const filtered = offers.filter((o) => {
      if (filter === "volunteers") return o.pricing_mode === "volunteer";
      if (filter === "fixed") return o.pricing_mode === "fixed";
      if (filter === "pros") return o.helper?.is_professional;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "price") return sortablePrice(a) - sortablePrice(b);
      if (sort === "rating")
        return (b.rating?.avg ?? -1) - (a.rating?.avg ?? -1);
      return b.created_at.localeCompare(a.created_at); // newest first
    });
    // The selected offer always floats to the top regardless of sort.
    return sorted.sort((a, b) =>
      a.status === "selected" ? -1 : b.status === "selected" ? 1 : 0
    );
  }, [offers, filter, sort]);

  const controlChip = (active: boolean) =>
    `chip whitespace-nowrap ${
      active
        ? "bg-brand text-white"
        : "border border-line bg-white text-body hover:border-brand/40"
    }`;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-extrabold text-ink">
          {S.offers.sectionTitle}
        </h2>
        <span className="text-sm text-muted">
          {S.offers.summary(
            offers.length,
            summary.min,
            summary.max,
            summary.volunteers
          )}
        </span>
      </div>

      {/* Sort + filter controls */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        <button onClick={() => setSort("newest")} className={controlChip(sort === "newest")}>
          {S.offers.sortByNewest}
        </button>
        <button onClick={() => setSort("price")} className={controlChip(sort === "price")}>
          {S.offers.sortByPrice}
        </button>
        <button onClick={() => setSort("rating")} className={controlChip(sort === "rating")}>
          {S.offers.sortByRating}
        </button>
        <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
        <button onClick={() => setFilter("all")} className={controlChip(filter === "all")}>
          {S.offers.filterAll}
        </button>
        <button onClick={() => setFilter("volunteers")} className={controlChip(filter === "volunteers")}>
          {S.offers.filterVolunteers}
        </button>
        <button onClick={() => setFilter("fixed")} className={controlChip(filter === "fixed")}>
          {S.offers.filterFixed}
        </button>
        <button onClick={() => setFilter("pros")} className={controlChip(filter === "pros")}>
          {S.offers.filterPros}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="card py-8 text-center text-muted">
          {S.offers.noMatchFilter}
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((o) => {
            const highlight = o.status === "selected";
            return (
              <li
                key={o.id}
                className={`rounded-2xl border bg-white p-4 space-y-3 ${
                  highlight
                    ? "border-2 border-brand shadow-[var(--shadow-raise)]"
                    : "border-line shadow-[var(--shadow-card)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    name={o.helper?.display_name ?? "?"}
                    path={o.helper?.avatar_path}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/helpers/${o.helper_id}`}
                      className="font-bold text-ink hover:underline"
                    >
                      {o.helper?.display_name}
                    </Link>
                    <div className="mt-0.5">
                      <Stars
                        value={o.rating ? o.rating.avg : null}
                        count={o.rating?.count ?? 0}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <OfferPriceChip offer={o} />
                    <span className="text-[10px] font-semibold text-muted">
                      {S.offers.stanceLabel[o.pricing_mode]}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    verified={o.helper?.is_identity_verified}
                    professional={o.helper?.is_professional}
                  />
                  {o.status === "selected" && (
                    <span className="chip bg-mint text-brand">
                      {S.offers.status.selected}
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-body">{o.message}</p>
                {canAssign && o.status === "active" && (
                  <AssignButton requestId={requestId} offerId={o.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// re-exported for callers that need the price text (kept co-located).
export { offerPriceText };
