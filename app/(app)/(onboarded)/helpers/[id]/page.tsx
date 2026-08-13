import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Badge,
  Stars,
  Avatar,
  StatChip,
  RatingBars,
  CategoryChips,
  EmptyState,
  formatDate,
} from "@/components/ui";
import { categoryLabel } from "@/lib/categories";
import { S } from "@/lib/strings";

type HelperStats = {
  completed_jobs: number;
  rating_count: number;
  rating_avg: number | null;
  distribution: Record<string, number>;
  categories: Record<string, number>;
};

/**
 * Public helper profile — a real reputation page: badges, a completed-jobs
 * count and category expertise (from get_helper_stats, aggregates only),
 * a star-distribution histogram, and per-review context (category + date)
 * via the anonymized helper_ratings view (no rater identity leaked).
 */
export default async function HelperProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: reviews }, { data: statsRaw }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_path, is_identity_verified, is_professional, created_at")
        .eq("id", id)
        .single(),
      supabase
        .from("helper_ratings")
        .select("stars, note, category, created_at")
        .eq("helper_id", id)
        .order("created_at", { ascending: false }),
      supabase.rpc("get_helper_stats", { p_helper_id: id }),
    ]);

  if (!profile) notFound();

  const stats = (statsRaw ?? {}) as Partial<HelperStats>;
  const count = stats.rating_count ?? 0;
  const avg = stats.rating_avg ?? null;
  const distribution = stats.distribution ?? {};
  const categories = stats.categories ?? {};
  const completedJobs = stats.completed_jobs ?? 0;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Identity + headline reputation */}
      <div className="card space-y-4">
        <div className="flex items-center gap-4">
          <Avatar name={profile.display_name} path={profile.avatar_path} size={64} />
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold text-ink">{profile.display_name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                verified={profile.is_identity_verified}
                professional={profile.is_professional}
              />
              <Stars value={avg} count={count} />
            </div>
            <p className="text-xs text-muted">
              {S.helpers.memberSince(formatDate(profile.created_at))}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <StatChip value={completedJobs} label={S.helpers.completedJobs} />
          <StatChip value={count} label={S.helpers.ratingCount} />
          <StatChip value={avg != null ? avg.toFixed(1) : "—"} label={S.lifecycle.stars} />
        </div>
      </div>

      {/* Category expertise */}
      {Object.keys(categories).length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-extrabold text-ink">{S.helpers.expertiseTitle}</h2>
          <CategoryChips categories={categories} />
        </section>
      )}

      {/* Rating distribution */}
      {count > 0 && (
        <section className="card space-y-3">
          <h2 className="font-extrabold text-ink">{S.helpers.distributionTitle}</h2>
          <RatingBars distribution={distribution} total={count} />
        </section>
      )}

      {/* Individual reviews with category context */}
      <section className="space-y-2">
        <h2 className="text-lg font-extrabold text-ink">
          {S.helpers.reviewsTitle} ({count})
        </h2>
        {!reviews?.length ? (
          <EmptyState message={S.helpers.noRatings} />
        ) : (
          <ul className="space-y-2">
            {reviews.map((r, i) => (
              <li key={i} className="card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars value={r.stars} />
                    {r.category && (
                      <span className="chip bg-tint text-body">
                        {categoryLabel(r.category)}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {formatDate(r.created_at)}
                  </span>
                </div>
                {r.note && <p className="mt-1.5 text-sm text-body">{r.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
