import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { haversineKm, formatDistance } from "@/lib/geo";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { StatusChip, PaymentChip, EmptyState, formatDate } from "@/components/ui";
import { S } from "@/lib/strings";

const FEED_CAP = 200; // architecture §8.1: bounded fetch, in-memory distance sort
const PAGE_SIZE = 12;

type SearchParams = Promise<{
  category?: string;
  payment?: string;
  page?: string;
}>;

export default async function RequestsFeedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { category, payment, page } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Feed rule (design 03 §5): open or has_offers, not hidden, newest first.
  let query = supabase
    .from("help_requests")
    .select(
      "id, title, category, payment_type, lat, lng, status, created_at"
    )
    .in("status", ["open", "has_offers"])
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(FEED_CAP);
  if (category) query = query.eq("category", category);
  if (payment === "paid" || payment === "volunteer")
    query = query.eq("payment_type", payment);

  const [{ data: requests }, { data: priv }] = await Promise.all([
    query,
    user
      ? supabase
          .from("profiles_private")
          .select("lat, lng")
          .eq("user_id", user.id)
          .single()
      : Promise.resolve({ data: null }),
  ]);

  const viewer = priv && priv.lat != null ? { lat: priv.lat, lng: priv.lng! } : null;

  // Distance sort on the server: raw coordinates never reach the browser.
  const withDistance = (requests ?? []).map((r) => ({
    ...r,
    distanceKm: viewer ? haversineKm(viewer.lat, viewer.lng, r.lat, r.lng) : null,
  }));
  if (viewer) withDistance.sort((a, b) => a.distanceKm! - b.distanceKm!);

  const totalPages = Math.max(1, Math.ceil(withDistance.length / PAGE_SIZE));
  const pageItems = withDistance.slice(
    (pageNum - 1) * PAGE_SIZE,
    pageNum * PAGE_SIZE
  );

  // First photo per request, one bulk signed-URL call for the page.
  const ids = pageItems.map((r) => r.id);
  const { data: photos } = ids.length
    ? await supabase
        .from("request_photos")
        .select("request_id, storage_path")
        .in("request_id", ids)
        .eq("position", 0)
    : { data: [] };
  const paths = (photos ?? []).map((p) => p.storage_path);
  const signed = paths.length
    ? (
        await supabase.storage
          .from("request-photos")
          .createSignedUrls(paths, 3600)
      ).data
    : [];
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  const photoByRequest = new Map(
    (photos ?? []).map((p) => [p.request_id, urlByPath.get(p.storage_path)])
  );

  const params = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { category, payment, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{S.requests.feedTitle}</h1>
        <Link href="/requests/new" className="btn-primary">
          + {S.requests.newRequest}
        </Link>
      </div>

      {!viewer && (
        <p className="text-sm text-stone-500">
          {S.profile.locationUnset}{" "}
          <Link href="/profile" className="underline">
            {S.nav.profile}
          </Link>
        </p>
      )}

      {/* Filters as chips — URL is the state */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/requests${params({ category: undefined, page: undefined })}`}
          className={`chip ${!category ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
        >
          {S.requests.allCategories}
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={`/requests${params({ category: c.key, page: undefined })}`}
            className={`chip ${category === c.key ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
          >
            {c.label}
          </Link>
        ))}
      </div>
      <div className="flex gap-2 text-sm">
        {[
          { key: undefined, label: "הכל" },
          { key: "paid", label: S.requests.paid },
          { key: "volunteer", label: S.requests.volunteer },
        ].map((p) => (
          <Link
            key={p.label}
            href={`/requests${params({ payment: p.key, page: undefined })}`}
            className={`chip ${payment === p.key || (!payment && !p.key) ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-700 hover:bg-stone-200"}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {!pageItems.length ? (
        <EmptyState message={S.requests.noOpenRequests} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="card block hover:border-emerald-400">
                {photoByRequest.get(r.id) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoByRequest.get(r.id)!}
                    alt=""
                    className="mb-3 h-36 w-full rounded-lg object-cover"
                  />
                )}
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <StatusChip status={r.status} />
                  <PaymentChip paymentType={r.payment_type} amount={null} />
                  <span className="chip bg-stone-100 text-stone-600">
                    {categoryLabel(r.category)}
                  </span>
                </div>
                <h2 className="font-semibold">{r.title}</h2>
                <p className="mt-1 flex justify-between text-xs text-stone-500">
                  <span>
                    {r.distanceKm != null
                      ? `${formatDistance(r.distanceKm)} ${S.requests.away}`
                      : S.requests.distanceUnknown}
                  </span>
                  <span>{formatDate(r.created_at)}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex justify-center gap-2 pt-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/requests${params({ page: String(p) })}`}
              className={`chip ${p === pageNum ? "bg-emerald-600 text-white" : "bg-stone-100 text-stone-700"}`}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
