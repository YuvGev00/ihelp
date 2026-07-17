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

  // Full application history per queued applicant (spec §4.1: resubmitting the
  // same content must not get a fresh roll of the dice).
  const queueUserIds = [...new Set((queue ?? []).map((a) => a.user_id))];
  const { data: history } = queueUserIds.length
    ? await supabase
        .from("verification_applications")
        .select("user_id, kind, status, admin_note, decided_at")
        .in("user_id", queueUserIds)
        .neq("status", "pending")
        .order("decided_at", { ascending: false })
    : { data: [] };
  type HistoryRow = {
    user_id: string;
    kind: string;
    status: string;
    admin_note: string | null;
    decided_at: string | null;
  };
  const historyByUser = new Map<string, HistoryRow[]>();
  for (const h of (history ?? []) as HistoryRow[]) {
    const list = historyByUser.get(h.user_id) ?? [];
    list.push(h);
    historyByUser.set(h.user_id, list);
  }

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
      <h1 className="text-2xl font-extrabold text-ink">{S.admin.title}</h1>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-ink">{S.admin.queueTitle}</h2>
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
                  <span className="font-bold text-ink">{app.full_name}</span>
                  {app.phone && (
                    <span dir="ltr" className="text-sm text-body">
                      {app.phone}
                    </span>
                  )}
                  <span className="ms-auto text-xs text-muted">
                    {formatDate(app.created_at)}
                  </span>
                </div>
                {app.self_description && (
                  <p className="mt-2 text-sm text-body">
                    {app.self_description}
                  </p>
                )}
                {app.doc_path && signedByPath.get(app.doc_path) && (
                  <a
                    href={signedByPath.get(app.doc_path) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-semibold text-brand underline"
                  >
                    {S.admin.viewDoc}
                  </a>
                )}
                {(historyByUser.get(app.user_id) ?? []).length > 0 && (
                  <div className="mt-2 rounded-xl bg-[#f7faf9] p-2 text-xs text-body">
                    <p className="font-bold">{S.admin.historyTitle}</p>
                    <ul className="mt-1 space-y-0.5">
                      {historyByUser.get(app.user_id)!.map((h, i) => (
                        <li key={i}>
                          {S.admin.kind[h.kind]} — {S.admin.statusLabel[h.status]}
                          {h.admin_note ? `: ${h.admin_note}` : ""}
                          {h.decided_at ? ` (${formatDate(h.decided_at)})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <ReviewForm applicationId={app.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-extrabold text-ink">{S.admin.moderationTitle}</h2>
        <ul className="space-y-2">
          {(requests ?? []).map((r) => (
            <li key={r.id} className="card flex flex-wrap items-center gap-3">
              <StatusChip status={r.status} />
              {r.is_hidden && (
                <span className="chip bg-ink text-white">
                  {S.requests.hidden}
                </span>
              )}
              <a
                href={`/requests/${r.id}`}
                className="font-bold text-ink hover:underline"
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
        <h2 className="mb-3 text-lg font-extrabold text-ink">
          {S.verification.verifiedIdentity}
        </h2>
        <ul className="space-y-2">
          {(verifiedUsers ?? []).map((u) => (
            <li key={u.id} className="card flex flex-wrap items-center gap-3">
              <span className="font-bold text-ink">{u.display_name || u.id}</span>
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
