import Link from "next/link";
import { S } from "@/lib/strings";

/** Missing rows and RLS-invisible rows land here — deliberately identical. */
export default function NotFound() {
  return (
    <div className="card mx-auto mt-10 max-w-md py-10 text-center">
      <h1 className="mb-2 text-xl font-bold">{S.common.notFoundTitle}</h1>
      <p className="mb-4 text-sm text-stone-600">{S.common.notFoundBody}</p>
      <Link href="/requests" className="btn-primary">
        {S.nav.requests}
      </Link>
    </div>
  );
}
