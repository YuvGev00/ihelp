import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Stars, Avatar, EmptyState, formatDate } from "@/components/ui";
import { S } from "@/lib/strings";

/** Public helper profile: name, badges, rating aggregate + list (via the
 *  helper_ratings view — no rater identity exposed to third parties). */
export default async function HelperProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: profile }, { data: ratings }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_path, is_identity_verified, is_professional, created_at")
      .eq("id", id)
      .single(),
    supabase
      .from("helper_ratings")
      .select("stars, note, created_at")
      .eq("helper_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!profile) notFound();

  const count = ratings?.length ?? 0;
  const avg = count
    ? ratings!.reduce((sum, r) => sum + r.stars, 0) / count
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="card">
        <div className="flex items-center gap-4">
          <Avatar name={profile.display_name} path={profile.avatar_path} size={64} />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{profile.display_name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                verified={profile.is_identity_verified}
                professional={profile.is_professional}
              />
              <Stars value={avg} count={count} />
            </div>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          {S.helpers.ratingCount} ({count})
        </h2>
        {!count ? (
          <EmptyState message={S.helpers.noRatings} />
        ) : (
          <ul className="space-y-2">
            {ratings!.map((r, i) => (
              <li key={i} className="card">
                <div className="flex items-center justify-between">
                  <Stars value={r.stars} />
                  <span className="text-xs text-muted">
                    {formatDate(r.created_at)}
                  </span>
                </div>
                {r.note && <p className="mt-1 text-sm text-body">{r.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
