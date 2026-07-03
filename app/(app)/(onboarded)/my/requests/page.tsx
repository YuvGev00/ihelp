import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/categories";
import { StatusChip, PaymentChip, EmptyState, formatDate } from "@/components/ui";
import { S } from "@/lib/strings";

export default async function MyRequestsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: requests } = await supabase
    .from("help_requests")
    .select("id, title, category, payment_type, status, is_paid, created_at")
    .eq("requester_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{S.requests.myRequestsTitle}</h1>
        <Link href="/requests/new" className="btn-primary">
          + {S.requests.newRequest}
        </Link>
      </div>

      {!requests?.length ? (
        <EmptyState message={S.requests.noMyRequests} />
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li key={r.id}>
              <Link
                href={`/requests/${r.id}`}
                className="card flex flex-wrap items-center gap-3 hover:border-emerald-400"
              >
                <StatusChip status={r.status} />
                <span className="font-medium">{r.title}</span>
                <span className="chip bg-stone-100 text-stone-600">
                  {categoryLabel(r.category)}
                </span>
                <PaymentChip paymentType={r.payment_type} amount={null} />
                {r.is_paid && (
                  <span className="chip bg-emerald-100 text-emerald-800">
                    {S.lifecycle.markedPaid}
                  </span>
                )}
                <span className="ms-auto text-xs text-stone-400">
                  {formatDate(r.created_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
