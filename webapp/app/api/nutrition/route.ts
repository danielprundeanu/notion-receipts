import { NextRequest, NextResponse } from "next/server";

// USDA FoodData Central — free, no registration needed with DEMO_KEY
const USDA_KEY = process.env.USDA_API_KEY ?? "DEMO_KEY";

type USDAFood = {
  description: string;
  foodNutrients: Array<{ nutrientId: number; value: number }>;
};

// Nutrient IDs in USDA FoodData Central
const NID = {
  kcal:    1008,
  carbs:   1005,
  fat:     1004,
  protein: 1003,
};

function getNutrient(food: USDAFood, id: number): number | null {
  const n = food.foodNutrients.find((n) => n.nutrientId === id);
  return n != null ? Math.round(n.value * 10) / 10 : null;
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get("q")?.trim();
  if (!query) return NextResponse.json({ error: "Missing query" }, { status: 400 });

  try {
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("query", query);
    url.searchParams.set("pageSize", "5");
    url.searchParams.set("dataType", "SR Legacy,Foundation");
    url.searchParams.set("api_key", USDA_KEY);

    const res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) throw new Error(`USDA API ${res.status}`);

    const data = (await res.json()) as { foods: USDAFood[] };

    const food = data.foods?.find(
      (f) => getNutrient(f, NID.kcal) != null
    );

    if (!food) {
      return NextResponse.json(
        { error: "Nu s-au găsit date nutriționale." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      name: food.description,
      kcal:    getNutrient(food, NID.kcal),
      carbs:   getNutrient(food, NID.carbs),
      fat:     getNutrient(food, NID.fat),
      protein: getNutrient(food, NID.protein),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Eroare la căutare" },
      { status: 500 }
    );
  }
}
