import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { importRecipes, ImportFailure, ImportInputError, type ConfirmedRecipe, type NewUnitRule } from "@/lib/import";

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { recipes, newUnitRules = [] } = (await req.json()) as {
      recipes: ConfirmedRecipe[];
      newUnitRules?: NewUnitRule[];
    };
    const { recipeIds, newIngredientsCreated } = await importRecipes(recipes, newUnitRules);

    revalidatePath("/recipes");
    revalidatePath("/ingredients");

    return NextResponse.json({
      success: true,
      recipeIds,
      recipesCreated: recipeIds.length,
      newIngredientsCreated,
    });
  } catch (err) {
    if (err instanceof ImportInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("[import/confirm] error:", err);
    // Some recipes may have committed before the failure (each is atomic). Refresh their
    // views and tell the client how many succeeded so the user knows where things stand.
    const recipeIds = err instanceof ImportFailure ? err.recipeIds : [];
    if (recipeIds.length > 0) {
      revalidatePath("/recipes");
      revalidatePath("/ingredients");
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Internal error",
        recipesCreated: recipeIds.length,
        recipeIds,
        newIngredientsCreated: err instanceof ImportFailure ? err.newIngredientsCreated : 0,
      },
      { status: 500 }
    );
  }
}
