"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  ArrowLeft,
  Clock,
  ExternalLink,
  Star,
  Flame,
  Pencil,
  Minus,
  Plus,
  Users,
} from "lucide-react";
import { toggleFavorite } from "@/lib/actions";

export type RecipeData = {
  id: string;
  name: string;
  servings: number | null;
  time: number | null;
  difficulty: string | null;
  category: string | null;
  favorite: boolean;
  link: string | null;
  notes: string | null;
  imageUrl: string | null;
  ingredients: Array<{
    id: string;
    quantity: number | null;
    unit: string | null;
    notes: string | null;
    groupOrder: number;
    groupName: string | null;
    groceryItem: {
      name: string;
      unit: string | null;
      kcal: number | null;
      carbs: number | null;
      fat: number | null;
      protein: number | null;
    } | null;
  }>;
  instructions: Array<{
    id: string;
    step: number;
    text: string;
    isSection: boolean;
  }>;
};

function formatQty(qty: number, scale: number): string {
  const scaled = qty * scale;
  // Round to nearest 0.1, strip trailing zero
  const s = (Math.round(scaled * 10) / 10).toString();
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

export default function RecipeDetail({ recipe }: { recipe: RecipeData }) {
  const defaultServings = recipe.servings ?? 1;
  const [servings, setServings] = useState(defaultServings);
  const scale = defaultServings > 0 ? servings / defaultServings : 1;
  const [isFavorite, setIsFavorite] = useState(recipe.favorite);
  const [, startTransition] = useTransition();

  function handleToggleFavorite() {
    const next = !isFavorite;
    setIsFavorite(next);
    startTransition(() => toggleFavorite(recipe.id, next));
  }

  // Group ingredients by groupOrder, preserve groupName
  type GroupEntry = { name: string | null; items: typeof recipe.ingredients };
  const groupMap = new Map<number, GroupEntry>();
  for (const ing of recipe.ingredients) {
    const key = ing.groupOrder ?? 1;
    if (!groupMap.has(key)) groupMap.set(key, { name: ing.groupName, items: [] });
    groupMap.get(key)!.items.push(ing);
  }
  const sortedGroups = [...groupMap.entries()].sort((a, b) => a[0] - b[0]);

  // Nutrition
  let totalKcal = 0, totalCarbs = 0, totalFat = 0, totalProtein = 0;
  let hasNutrition = false;
  for (const ing of recipe.ingredients) {
    if (!ing.groceryItem || !ing.quantity) continue;
    const gi = ing.groceryItem;
    if (!gi.kcal && !gi.protein) continue;
    if (gi.unit !== "g" && gi.unit !== "ml") continue;
    hasNutrition = true;
    const factor = (ing.quantity * scale) / 100;
    totalKcal += (gi.kcal ?? 0) * factor;
    totalCarbs += (gi.carbs ?? 0) * factor;
    totalFat += (gi.fat ?? 0) * factor;
    totalProtein += (gi.protein ?? 0) * factor;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8">
      {/* Nav */}
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/recipes"
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft size={15} /> Back to recipes
        </Link>
        <Link
          href={`/recipes/${recipe.id}/edit`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          <Pencil size={13} /> Edit
        </Link>
      </div>

      {/* Cover image */}
      {recipe.imageUrl && (
        <div className="w-full h-56 md:h-72 rounded-2xl overflow-hidden mb-6 bg-gray-100">
          <img
            src={recipe.imageUrl}
            alt={recipe.name}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900">{recipe.name}</h1>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleToggleFavorite}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className="p-1.5 rounded-lg hover:bg-amber-50 transition-colors"
            >
              <Star
                size={20}
                className={isFavorite ? "text-amber-400 fill-amber-400" : "text-gray-300 hover:text-amber-300"}
              />
            </button>
            {recipe.link && (
              <a
                href={recipe.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
              >
                <ExternalLink size={14} /> Source
              </a>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mt-4">
          {recipe.category && (
            <span className="px-3 py-1 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
              {recipe.category}
            </span>
          )}
          {recipe.difficulty && (
            <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium">
              {recipe.difficulty}
            </span>
          )}
          {recipe.time && (
            <span className="flex items-center gap-1.5 text-sm text-gray-600 font-medium">
              <Clock size={14} className="text-gray-500" /> {recipe.time} min
            </span>
          )}
        </div>

        {recipe.notes && (
          <p className="mt-4 text-gray-700 text-sm bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
            {recipe.notes}
          </p>
        )}
      </div>

      {/* Servings control */}
      <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
        <Users size={15} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">Servings</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setServings((s) => Math.max(1, s - 1))}
            className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <Minus size={12} />
          </button>
          <span className="w-8 text-center text-sm font-bold text-gray-900">
            {servings}
          </span>
          <button
            onClick={() => setServings((s) => s + 1)}
            className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-50 text-gray-700 transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
        {servings !== defaultServings && (
          <button
            onClick={() => setServings(defaultServings)}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            reset
          </button>
        )}
        {scale !== 1 && (
          <span className="text-xs text-orange-600 font-medium bg-orange-50 px-2 py-0.5 rounded-full">
            ×{Math.round(scale * 100) / 100} scaled
          </span>
        )}
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Ingredients */}
        <div className="lg:col-span-2">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Ingredients
          </h2>

          {sortedGroups.length === 0 ? (
            <p className="text-sm text-gray-500">No ingredients listed</p>
          ) : (
            <div className="space-y-5">
              {sortedGroups.map(([groupOrder, group]) => (
                <div key={groupOrder}>
                  {(sortedGroups.length > 1 || group.name) && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                      {group.name ?? `Part ${groupOrder}`}
                    </p>
                  )}
                  <ul className="space-y-2">
                    {group.items.map((ing) => (
                      <li
                        key={ing.id}
                        className="flex items-baseline gap-2 text-sm"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0 mt-[5px]" />
                        <span>
                          {ing.quantity != null && (
                            <span className="font-semibold text-gray-900">
                              {formatQty(ing.quantity, scale)}
                              {ing.unit ? ` ${ing.unit}` : ""}
                            </span>
                          )}{" "}
                          <span className="text-gray-800">
                            {ing.groceryItem?.name ?? "—"}
                          </span>
                          {ing.notes && (
                            <span className="text-gray-500"> · {ing.notes}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>

                </div>
              ))}
            </div>
          )}

          {/* Nutrition */}
          {hasNutrition && (
            <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-3">
                <Flame size={14} className="text-orange-500" />
                Nutrition · {servings} serving{servings !== 1 ? "s" : ""}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: "kcal", value: Math.round(totalKcal) },
                  { label: "carbs", value: `${Math.round(totalCarbs)}g` },
                  { label: "fat", value: `${Math.round(totalFat)}g` },
                  { label: "protein", value: `${Math.round(totalProtein)}g` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <div className="font-bold text-gray-900 text-sm">
                      {value}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Instructions */}
        <div className="lg:col-span-3">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Instructions
          </h2>
          {recipe.instructions.length === 0 ? (
            <p className="text-sm text-gray-500">No instructions yet</p>
          ) : (
            <div className="space-y-4">
              {recipe.instructions.map((inst, i) =>
                inst.isSection ? (
                  <h3
                    key={i}
                    className="text-xs font-bold uppercase tracking-wide text-gray-600 pt-1"
                  >
                    {inst.text}
                  </h3>
                ) : (
                  <div key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">
                      {inst.step}
                    </span>
                    <p className="text-sm text-gray-800 leading-relaxed">
                      {inst.text}
                    </p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
