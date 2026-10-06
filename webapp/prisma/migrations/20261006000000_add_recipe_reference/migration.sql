-- CreateTable
CREATE TABLE "RecipeReference" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "refRecipeId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'serving',
    "groupOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RecipeReference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecipeReference_recipeId_idx" ON "RecipeReference"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeReference_refRecipeId_idx" ON "RecipeReference"("refRecipeId");

-- AddForeignKey
ALTER TABLE "RecipeReference" ADD CONSTRAINT "RecipeReference_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeReference" ADD CONSTRAINT "RecipeReference_refRecipeId_fkey" FOREIGN KEY ("refRecipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
