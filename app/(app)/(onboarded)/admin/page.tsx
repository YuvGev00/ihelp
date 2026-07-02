import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReviewForm, HideToggle, RevokeButton } from "@/components/AdminReview";
import { StatusChip, EmptyState, formatDate } from "@/components/ui";
import { S } from "@/lib/strings";

/**
 * Admin dashboard. The page 404s for non-admins for UX, but authority lives in
 * the DB: the queue SELECT is admin-gated by RLS and every action is an RPC
 * that re-checks is_admin() in its body.
 */
export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: priv } = await supabase
    .from("profiles_private")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();
  if (!priv?.is_admin) notFound();

  const [{ data: queue }, { data: requests }, { data: verifiedUsers }] =
    await Promise.all([
      supabase
        .from("verification_applications")
        .select("id, user_id, kind, full_name, self_description, phone, doc_path, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      supabase
        .from("help_requests")
        .select("id, title, status, is_hidden, created_at, requester_id")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("profiles")
        .select("id, display_name, is_identity_verified, is_professional")
        .eq("is_identity_verified", true)
        .order("display_name"),
    ]);

  // Bulk signed URLs for verification documents (private bucket; 1h expiry).
  const docPaths = (queue ?? []).map((a) => a.doc_path).filter(Boolean) as string[];
  const signed = docPaths.length
    ? (
        await supabase.storage
          .from("verification-docs")
          .createSignedUrls(docPaths, 3600)
      ).data
    : [];
  const signedByPath = new Map(
    (signed ?? []).map((s) => [s.path, s.signedUrl])
  );

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">{S.admin.title}</h1>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{S.admin.queueTitle}</h2>
        {!queue?.length ? (
          <EmptyState message={S.admin.queueEmpty} />
        ) : (
          <ul className="space-y-4">
            {queue.map((app) => (
              <li key={app.id} className="card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="chip bg-purple-100 text-purple-800">
                    {S.admin.kind[app.kind]}
                  </span>
                  <span className="font-semibold">{app.full_name}</span>
                  {app.phone && (
                    <span dir="ltr" className="text-sm text-stone-600">
                      {app.phone}
                    </span>
                  )}
                  <span className="ms-auto text-xs text-stone-400">
                    {formatDate(app.created_at)}
                  </span>
                </div>
                {app.self_description && (
                  <p className="mt-2 text-sm text-stone-600">
                    {app.self_description}
                  </p>
                )}
                {app.doc_path && signedByPath.get(app.doc_path) && (
                  <a
                    href={signedByPath.get(app.doc_path) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-semibold text-emerald-700 underline"
                  >
                    {S.admin.viewDoc}
                  </a>
                )}
                <ReviewForm applicationId={app.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">{S.admin.moderationTitle}</h2>
        <ul className="space-y-2">
          {(requests ?? []).map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-3">
              <StatusChip status={r.status} />
              {r.is_hidden && (
                <span className="chip bg-stone-800 text-white">
                  {S.requests.hidden}
                </span>
              )}
              <a
                href={`/requests/${r.id}`}
                className="font-medium hover:underline"
              >
                {r.title}
              </a>
              <span className="ms-auto">
                <HideToggle requestId={r.id} hidden={r.is_hidden} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          {S.verification.verifiedIdentity}
        </h2>
        <ul className="space-y-2">
          {(verifiedUsers ?? []).map((u) => (
            <li key={u.id} className="card flex flex-wrap items-center gap-3">
              <span className="font-medium">{u.display_name || u.id}</span>
              <span className="ms-auto flex gap-2">
                {u.is_professional && (
                  <RevokeButton userId={u.id} kind="professional" />
                )}
                <RevokeButton userId={u.id} kind="identity" />
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
