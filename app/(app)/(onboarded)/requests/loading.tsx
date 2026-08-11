/** Skeleton mirrors the real feed: title + filter rows, map, then horizontal
 *  thumbnail-left cards — so content arrival causes no layout jump. */
export default function FeedLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-40 rounded bg-tile" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-7 w-20 rounded-lg bg-tile" />
        ))}
      </div>
      <div className="h-72 w-full rounded-xl bg-tile" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card flex gap-3 p-3">
            <div className="h-[82px] w-[82px] shrink-0 rounded-xl bg-tile" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-16 rounded bg-tile" />
              <div className="h-5 w-full rounded bg-tile" />
              <div className="h-3 w-1/2 rounded bg-tile" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
