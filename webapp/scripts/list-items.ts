import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const k = line.slice(0, eq).trim(), v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const items = await prisma.groceryItem.findMany({
  select: { name: true, nameRo: true, category: true },
  orderBy: { category: "asc" },
});

for (const item of items) {
  console.log(`${item.category ?? "null"}\t${item.name}\t${item.nameRo ?? ""}`);
}
console.error(`\nTotal: ${items.length}`);
await prisma.$disconnect();
