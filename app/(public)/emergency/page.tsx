import Link from "next/link";
import { S } from "@/lib/strings";

/**
 * HARD BOUNDARY (product spec §11): information only. Static page, tel: links
 * that open the device dialer, zero business logic, no form, no data access.
 * force-static makes any regression to dynamic rendering fail the build;
 * the middleware matcher excludes this route entirely.
 */
export const dynamic = "force-static";

export default function EmergencyPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <h1 className="mb-3 text-3xl font-extrabold text-ink">{S.emergency.title}</h1>
      <p className="mb-8 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-800">
        {S.emergency.notice}
      </p>

      <ul className="space-y-3">
        {S.emergency.services.map((svc) => (
          <li
            key={svc.phone}
            className="card flex items-center justify-between"
          >
            <div>
              <div className="font-bold text-ink">{svc.name}</div>
              <div className="text-2xl font-extrabold text-brand" dir="ltr">
                {svc.phone}
              </div>
            </div>
            <a href={`tel:${svc.phone}`} className="btn-primary">
              {S.emergency.call} {svc.phone}
            </a>
          </li>
        ))}
      </ul>

      <Link href="/" className="mt-8 inline-block text-sm text-muted underline">
        {S.common.back}
      </Link>
    </main>
  );
}
