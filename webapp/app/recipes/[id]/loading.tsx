// Shown the moment a recipe is tapped, while its page renders on the server.
export default function RecipeLoading() {
  return (
    <div className="animate-pulse md:p-8 md:max-w-3xl" aria-busy="true" aria-label="Loading recipe">
      <div className="h-[250px] md:h-80 md:rounded-2xl bg-gray-200 dark:bg-[#2e2a24]" />
      <div className="px-4 md:px-0 pt-5 space-y-3">
        <div className="h-3 w-24 rounded bg-gray-100 dark:bg-[#24211c]" />
        <div className="h-8 w-4/5 rounded-lg bg-gray-200 dark:bg-[#2e2a24]" />
        <div className="h-8 w-2/5 rounded-lg bg-gray-200 dark:bg-[#2e2a24]" />
        <div className="grid grid-cols-3 gap-2 pt-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-[#24211c]" />
          ))}
        </div>
        <div className="h-16 rounded-2xl bg-gray-100 dark:bg-[#24211c]" />
        <div className="h-12 rounded-2xl bg-gray-100 dark:bg-[#24211c]" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-5 rounded bg-gray-100 dark:bg-[#24211c]" style={{ width: `${60 + ((i * 13) % 35)}%` }} />
        ))}
      </div>
    </div>
  );
}
