import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { EmptyState, formatDate } from "@/components/ui";
import { S } from "@/lib/strings";

export default async function MyOffersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: offers } = await supabase
    .from("offers")
    .select("id, request_id, request_title, status, message, created_at")
    .eq("helper_id", user.id)
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
    selected: "bg-emerald-100 text-emerald-800",
    closed: "bg-stone-200 text-stone-600",
    withdrawn: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{S.offers.myOffersTitle}</h1>

      {!offers?.length ? (
        <EmptyState message={S.offers.noMyOffers} />
      ) : (
        <ul className="space-y-2">
          {offers.map((o) => {
            const card = (
              <div className="card flex flex-wrap items-center gap-3">
                <span className={`chip ${OFFER_STYLES[o.status] ?? ""}`}>
                  {S.offers.status[o.status]}
                </span>
                <span className="font-medium">{o.request_title}</span>
                {!visible.has(o.request_id) && (
                  <span className="text-xs text-stone-400">
                    ({S.offers.requestGone})
                  </span>
                )}
                <span className="ms-auto text-xs text-stone-400">
                  {formatDate(o.created_at)}
                </span>
              </div>
            );
            return (
              <li key={o.id}>
                {visible.has(o.request_id) ? (
                  <Link
                    href={`/requests/${o.request_id}`}
                    className="block hover:opacity-90"
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
