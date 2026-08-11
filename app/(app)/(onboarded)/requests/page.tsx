import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { haversineKm, formatDistance } from "@/lib/geo";
import { CATEGORIES, categoryLabel } from "@/lib/categories";
import { PublicStatusChip, EmptyState, formatDate } from "@/components/ui";
import { FeedMap } from "@/components/FeedMap";
import type { MapPin } from "@/components/RequestsMap";
import { S } from "@/lib/strings";

const FEED_CAP = 200; // architecture §8.1: bounded fetch, in-memory distance sort
const PAGE_SIZE = 12;

const DISTANCE_OPTIONS = [5, 10, 25, 50]; // km — range filter chips

type SearchParams = Promise<{
  category?: string;
  dist?: string;
  page?: string;
}>;

export default async function RequestsFeedPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { category, dist, page } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const distKm =
    dist && DISTANCE_OPTIONS.includes(Number(dist)) ? Number(dist) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Feed rule (design 03 §5): open or has_offers, not hidden, newest first.
  let query = supabase
    .from("help_requests")
    .select("id, title, category, lat, lng, status, created_at")
    .in("status", ["open", "has_offers"])
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })
    .limit(FEED_CAP);
  if (category) query = query.eq("category", category);

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
  let withDistance = (requests ?? []).map((r) => ({
    ...r,
    distanceKm: viewer ? haversineKm(viewer.lat, viewer.lng, r.lat, r.lng) : null,
  }));
  if (viewer) withDistance.sort((a, b) => a.distanceKm! - b.distanceKm!);

  // Distance filter (only meaningful with a viewer location): keep requests
  // within the selected radius. Applied before paging AND before the map pins,
  // so list and map stay in sync.
  if (viewer && distKm != null) {
    withDistance = withDistance.filter((r) => r.distanceKm! <= distKm);
  }

  const totalPages = Math.max(1, Math.ceil(withDistance.length / PAGE_SIZE));
  const pageItems = withDistance.slice(
    (pageNum - 1) * PAGE_SIZE,
    pageNum * PAGE_SIZE
  );

  // Map pins for EVERY matching request (not just the current page), so the map
  // is a live overview of all open help nearby. Coordinates already reach the
  // client via the map; the browsing UI keeps showing distances, not raw coords
  // for cards — this is the deliberate exception where the map needs points.
  const pins: MapPin[] = withDistance.map((r) => ({
    id: r.id,
    title: r.title,
    category: categoryLabel(r.category),
    distanceText:
      r.distanceKm != null ? `${formatDistance(r.distanceKm)} ${S.requests.away}` : null,
    lat: r.lat,
    lng: r.lng,
  }));

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
    const merged = { category, dist, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    const qs = sp.toString();
    return qs ? `?${qs}` : "";
  };

  // Pill filter chip — active gets the brand fill, the rest a bordered white.
  const filterChip = (on: boolean) =>
    `chip whitespace-nowrap ${
      on
        ? "bg-brand text-white"
        : "border border-line bg-white text-body hover:border-brand/40"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">
            {S.requests.feedTitle}
          </h1>
          {viewer && (
            <p className="mt-0.5 text-sm text-muted">{S.requests.sortedByDistance}</p>
          )}
        </div>
        {/* Desktop-only 'new request' button — on mobile the FAB covers this */}
        <Link href="/requests/new" className="btn-primary hidden md:inline-flex">
          + {S.requests.newRequest}
        </Link>
      </div>

      {!viewer && (
        <p className="text-sm text-muted">
          {S.profile.locationUnset}{" "}
          <Link href="/profile" className="text-brand underline">
            {S.nav.profile}
          </Link>
        </p>
      )}

      {/* Category filters — pill chips, URL is the state */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href={`/requests${params({ category: undefined, page: undefined })}`}
          className={filterChip(!category)}
        >
          {S.requests.allCategories}
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.key}
            href={`/requests${params({ category: c.key, page: undefined })}`}
            className={filterChip(category === c.key)}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {/* Distance filter — range chips. Disabled without a viewer location
          (distance can't be computed); the hint links to the profile. */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-[#35433d]">{S.requests.distanceLabel}:</span>
        {viewer ? (
          <>
            <Link
              href={`/requests${params({ dist: undefined, page: undefined })}`}
              className={filterChip(!distKm)}
            >
              {S.requests.distanceAll}
            </Link>
            {DISTANCE_OPTIONS.map((km) => (
              <Link
                key={km}
                href={`/requests${params({ dist: String(km), page: undefined })}`}
                className={filterChip(distKm === km)}
              >
                {S.requests.distanceKm(km)}
              </Link>
            ))}
          </>
        ) : (
          <span className="text-xs text-muted">
            {S.requests.distanceNeedsLocation}{" "}
            <Link href="/profile" className="text-brand underline">
              {S.nav.profile}
            </Link>
          </span>
        )}
      </div>

      {/* Map overview of all matching requests (open by default) */}
      <FeedMap pins={pins} />

      {!pageItems.length ? (
        <EmptyState
          message={
            viewer && distKm != null
              ? S.requests.noRequestsInRange
              : category
                ? S.requests.noRequestsInCategory
                : S.requests.noOpenRequests
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pageItems.map((r) => {
            const photo = photoByRequest.get(r.id);
            return (
              <li key={r.id}>
                <Link
                  href={`/requests/${r.id}`}
                  className="card flex gap-3 p-3 transition hover:-translate-y-0.5 hover:border-brand/40"
                >
                  {/* Image-left thumbnail (mint placeholder when none) */}
                  <div className="h-[82px] w-[82px] shrink-0 overflow-hidden rounded-xl bg-[#e5efeb]">
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <PublicStatusChip status={r.status} />
                      <span className="text-[11px] font-semibold text-muted">
                        {categoryLabel(r.category)}
                      </span>
                    </div>
                    <h2 className="line-clamp-2 font-bold leading-snug text-ink">
                      {r.title}
                    </h2>
                    <p className="mt-1.5 flex justify-between text-xs text-muted">
                      <span className="font-semibold text-brand">
                        {r.distanceKm != null
                          ? `${formatDistance(r.distanceKm)} ${S.requests.away}`
                          : S.requests.distanceUnknown}
                      </span>
                      <span>{formatDate(r.created_at)}</span>
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex justify-center gap-2 pt-2" aria-label="עמודים">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/requests${params({ page: String(p) })}`}
              className={filterChip(p === pageNum)}
              aria-current={p === pageNum ? "page" : undefined}
            >
              {p}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
