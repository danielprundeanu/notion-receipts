// Instant feedback while /recipes renders on the server: without a loading boundary the
// tap does nothing visible until the whole page arrives (measured ~0.3–1 s on mobile).
export default function RecipesLoading() {
  return (
    <div className="px-4 pt-4 md:p-8 animate-pulse" aria-busy="true" aria-label="Loading recipes">
      <div className="flex items-center justify-between mb-4">
        <div className="h-8 w-32 rounded-lg bg-gray-200 dark:bg-[#2e2a24]" />
        <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-[#2e2a24]" />
      </div>
      <div className="h-12 rounded-2xl bg-gray-100 dark:bg-[#24211c] mb-3" />
      <div className="flex gap-2 mb-5 overflow-hidden">
        {[72, 84, 64, 76, 60].map((w, i) => (
          <div key={i} className="h-10 shrink-0 rounded-full bg-gray-100 dark:bg-[#24211c]" style={{ width: w }} />
        ))}
      </div>
      <div className="space-y-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5">
            <div className="w-16 h-16 rounded-2xl bg-gray-200 dark:bg-[#2e2a24] shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-[#2e2a24]" />
              <div className="h-3 w-1/3 rounded bg-gray-100 dark:bg-[#24211c]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
