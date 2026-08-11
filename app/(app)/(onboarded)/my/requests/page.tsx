import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, getUser } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/categories";
import { StatusChip, HiddenChip, EmptyState, formatDate } from "@/components/ui";
import { S } from "@/lib/strings";

export default async function MyRequestsPage() {
  const user = await getUser();
  const supabase = await createClient();
  if (!user) redirect("/login");

  const { data: requests } = await supabase
    .from("help_requests")
    .select("id, title, category, status, is_paid, is_hidden, created_at")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-extrabold text-ink">
          {S.requests.myRequestsTitle}
        </h1>
        <Link href="/requests/new" className="btn-primary hidden md:inline-flex">
          + {S.requests.newRequest}
        </Link>
      </div>

      {!requests?.length ? (
        <EmptyState message={S.requests.noMyRequests} />
      ) : (
        <ul className="space-y-2.5">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="card block transition hover:-translate-y-0.5 hover:border-brand/40"
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                  <StatusChip status={r.status} />
                  {r.is_hidden && <HiddenChip />}
                  <span className="text-[11px] font-semibold text-muted">
                    {categoryLabel(r.category)}
                  </span>
                  {r.is_paid && (
                    <span className="chip bg-mint text-brand">
                      {S.lifecycle.markedPaid}
                    </span>
                  )}
                  <span className="ms-auto text-xs text-muted">
                    {formatDate(r.created_at)}
                  </span>
                </div>
                <h2 className="font-bold text-ink">{r.title}</h2>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
