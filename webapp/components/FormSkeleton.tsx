// Loading placeholder for the form-style pages under /recipes (new, edit, import), so they
// don't inherit the recipe-list skeleton from app/recipes/loading.tsx.
export default function FormSkeleton({ label }: { label: string }) {
  return (
    <div className="px-4 pt-4 md:p-8 md:max-w-3xl animate-pulse" aria-busy="true" aria-label={label}>
      <div className="h-8 w-44 rounded-lg bg-gray-200 dark:bg-[#2e2a24] mb-6" />
      <div className="h-40 rounded-2xl bg-gray-100 dark:bg-[#24211c] mb-5" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="mb-5">
          <div className="h-3.5 w-24 rounded bg-gray-200 dark:bg-[#2e2a24] mb-2" />
          <div className="h-12 rounded-xl bg-gray-100 dark:bg-[#24211c]" />
        </div>
      ))}
    </div>
  );
}
