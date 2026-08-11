"use client";

import { S } from "@/lib/strings";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-md py-10 text-center">
      <h1 className="mb-2 text-xl font-extrabold text-ink">{S.common.errorTitle}</h1>
      <button onClick={reset} className="btn-primary">
        {S.common.retry}
      </button>
    </div>
  );
}
