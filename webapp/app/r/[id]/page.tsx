import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getRecipe } from "@/lib/actions";

// Public route (excluded from the auth middleware) — serves only a preview card
// (name, description, image) so shared links get a rich Open Graph preview. The
// full recipe stays behind login via the "View full recipe" link.

async function originFromHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "";
}

function buildDescription(r: { notes?: string | null; category: string | null; time: number | null; servings: number | null }): string {
  const notes = r.notes?.trim();
  if (notes) return notes;
  const bits = [
    r.category,
    r.time ? `${r.time} min` : null,
    r.servings ? `${r.servings} servings` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : "A recipe on Meal Planner.";
}

function absImage(imageUrl: string | null, origin: string): string | undefined {
  if (!imageUrl) return undefined;
  if (imageUrl.startsWith("http")) return imageUrl;
  if (imageUrl.startsWith("/") && origin) return `${origin}${imageUrl}`;
  return undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) return { title: "Recipe not found" };

  const origin = await originFromHeaders();
  const description = buildDescription(recipe);
  const img = absImage(recipe.imageUrl, origin);

  return {
    title: recipe.name,
    description,
    openGraph: {
      title: recipe.name,
      description,
      type: "article",
      ...(origin ? { url: `${origin}/r/${id}` } : {}),
      ...(img ? { images: [{ url: img }] } : {}),
    },
    twitter: {
      card: img ? "summary_large_image" : "summary",
      title: recipe.name,
      description,
      ...(img ? { images: [img] } : {}),
    },
  };
}

export default async function RecipePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  const description = buildDescription(recipe);
  const hasImage =
    recipe.imageUrl && (recipe.imageUrl.startsWith("http") || recipe.imageUrl.startsWith("/"));

  return (
    // Fixed overlay covers the app shell (sidebar / bottom nav) for a clean standalone preview.
    <div className="fixed inset-0 z-50 overflow-auto bg-[var(--color-bg-base)] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#24211c] rounded-2xl border border-gray-100 dark:border-[#2e2a24] overflow-hidden shadow-sm">
        {hasImage && (
          <div className="w-full h-56 bg-gray-100 dark:bg-[#2a2620]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={recipe.imageUrl!} alt={recipe.name} className="w-full h-full object-cover" />
          </div>
        )}
        <div className="p-5">
          <h1 className="text-xl font-bold text-gray-900 dark:text-[#eae5de]">{recipe.name}</h1>
          {description && (
            <p className="text-sm text-gray-600 dark:text-[#a49c90] mt-1.5">{description}</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-xs text-gray-500 dark:text-[#7c756a]">
            {recipe.category && <span>{recipe.category}</span>}
            {recipe.time && <span>{recipe.time} min</span>}
            {recipe.servings && <span>{recipe.servings} servings</span>}
          </div>
          <Link
            href={`/recipes/${id}`}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 transition-colors"
          >
            View full recipe
          </Link>
          <p className="mt-2 text-center text-xs text-gray-400 dark:text-[#5c554b]">
            Sign in required to view the full recipe.
          </p>
        </div>
      </div>
    </div>
  );
}
