import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { EmptyState, OfferPriceChip } from "@/components/ui";
import { S } from "@/lib/strings";

export default async function MyOffersPage() {
  const user = await getUser();
  const supabase = await createClient();
  if (!user) redirect("/login");

  // Withdrawn offers are hidden from this list — a withdrawal is the helper
  // taking their offer back, so it should not linger as clutter. The withdraw
  // action itself still exists (a helper's exit before assignment).
  const { data: offers } = await supabase
    .from("offers")
    .select("id, request_id, request_title, status, message, pricing_mode, price, final_price, created_at")
    .eq("helper_id", user.id)
    .neq("status", "withdrawn")
    .order("created_at", { ascending: false });

  // Which parent requests are still visible to this helper? Losing offerers
  // lose SELECT after assignment/cancel/hide (spec §9.2) — render those cards
  // from the offer's title snapshot without a link.
  const requestIds = [...new Set((offers ?? []).map((o) => o.request_id))];
  const { data: visibleRequests } = requestIds.length
    ? await supabase.from("help_requests").select("id").in("id", requestIds)
    : { data: [] };
  const visible = new Set((visibleRequests ?? []).map((r) => r.id));

  const OFFER_STYLES: Record<string, string> = {
    active: "bg-sky-100 text-sky-800",
    selected: "bg-mint text-brand",
    closed: "bg-tint text-muted",
    withdrawn: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-extrabold text-ink">{S.offers.myOffersTitle}</h1>

      {!offers?.length ? (
        <EmptyState message={S.offers.noMyOffers} />
      ) : (
        <ul className="space-y-2.5">
          {offers.map((o) => {
            // A closed (lost) offer is dimmed — it's history, not actionable.
            const dimmed = o.status === "closed";
            const card = (
              <div className={`card block ${dimmed ? "opacity-70" : ""}`}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className={`chip ${OFFER_STYLES[o.status] ?? ""}`}>
                    {S.offers.status[o.status]}
                  </span>
                  <OfferPriceChip offer={o} />
                </div>
                <h2 className="font-bold text-ink">{o.request_title}</h2>
                <p className="mt-1 line-clamp-1 text-xs text-muted">
                  {!visible.has(o.request_id)
                    ? S.offers.requestGone
                    : `״${o.message}״`}
                </p>
              </div>
            );
            return (
              <li key={o.id}>
                {visible.has(o.request_id) ? (
                  <Link
                    href={`/requests/${o.request_id}`}
                    className="block transition hover:-translate-y-0.5"
                  >
                    {card}
                  </Link>
                ) : (
                  card
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
