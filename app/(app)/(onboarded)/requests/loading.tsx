export default function FeedLoading() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="card animate-pulse">
          <div className="mb-3 h-36 rounded-lg bg-stone-200" />
          <div className="mb-2 h-4 w-2/3 rounded bg-stone-200" />
          <div className="h-3 w-1/3 rounded bg-stone-100" />
        </div>
      ))}
    </div>
  );
}
