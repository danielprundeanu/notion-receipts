-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "servings" INTEGER,
    "time" INTEGER,
    "difficulty" TEXT,
    "category" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "imageUrl" TEXT,
    "notionId" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "GroceryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "unit2" TEXT,
    "conversion" REAL,
    "kcal" REAL,
    "carbs" REAL,
    "fat" REAL,
    "protein" REAL,
    "notionId" TEXT
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "groceryItemId" TEXT,
    "groupName" TEXT,
    "groupOrder" INTEGER NOT NULL DEFAULT 0,
    "quantity" REAL,
    "unit" TEXT,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Ingredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Ingredient_groceryItemId_fkey" FOREIGN KEY ("groceryItemId") REFERENCES "GroceryItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Instruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "step" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isSection" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Instruction_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WeekPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "mealType" TEXT NOT NULL,
    "servings" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WeekPlan_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_notionId_key" ON "Recipe"("notionId");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryItem_name_key" ON "GroceryItem"("name");

-- CreateIndex
CREATE UNIQUE INDEX "GroceryItem_notionId_key" ON "GroceryItem"("notionId");
