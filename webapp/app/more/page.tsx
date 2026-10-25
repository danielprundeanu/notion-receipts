import Link from "next/link";
import { Leaf, Download, Plus, ChevronRight, type LucideIcon } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import SignOutButton from "@/components/SignOutButton";
import AddRecipesTrigger from "@/components/add-recipes/AddRecipesTrigger";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// The tools used less often than Recipes / Plan / Shop, plus the old Settings page.
export default async function MorePage() {
  const [session, ingredientCount] = await Promise.all([auth(), prisma.groceryItem.count()]);

  // A row without href opens Add recipes in place instead of going to a page.
  const kitchen: { href?: string; title: string; sub: string; Icon: LucideIcon }[] = [
    { href: "/ingredients", title: "Ingredients", sub: `${ingredientCount} items · nutrition, units, categories`, Icon: Leaf },
    { title: "Import recipes", sub: "Ask AI, paste text, or a photo/PDF", Icon: Download },
    { href: "/recipes/new", title: "New recipe", sub: "Write one from scratch", Icon: Plus },
  ];
  const row =
    "flex items-center gap-3.5 px-4 py-3 min-h-16 border-t first:border-t-0 border-gray-100 dark:border-[#2e2a24] hover:bg-gray-50 dark:hover:bg-[#2a2620] transition-colors";

  return (
    <div className="px-4 pt-4 md:p-8 max-w-2xl">
      <h1 className="text-3xl text-gray-900 dark:text-[#eae5de] mb-5">More</h1>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[#a49c90] mb-2">Kitchen</h2>
      <div className="bg-white dark:bg-[#201c18] border border-gray-100 dark:border-[#2e2a24] rounded-2xl overflow-hidden">
        {kitchen.map(({ href, title, sub, Icon }) => {
          const body = (
            <>
              <span className="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                <Icon size={19} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-base font-semibold text-gray-900 dark:text-[#eae5de]">{title}</span>
                <span className="block text-sm text-gray-600 dark:text-[#a49c90] truncate">{sub}</span>
              </span>
              <ChevronRight size={18} className="text-gray-400 dark:text-[#7c756a] shrink-0" />
            </>
          );
          return href ? (
            <Link key={title} href={href} className={row}>
              {body}
            </Link>
          ) : (
            <AddRecipesTrigger key={title} className={`${row} w-full text-left`}>
              {body}
            </AddRecipesTrigger>
          );
        })}
      </div>

      <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-[#a49c90] mt-7 mb-2">Settings</h2>
      <div className="bg-white dark:bg-[#201c18] border border-gray-100 dark:border-[#2e2a24] rounded-2xl overflow-hidden">
        <div className="px-4 pt-3 pb-1">
          <p className="text-base font-semibold text-gray-900 dark:text-[#eae5de]">Appearance</p>
        </div>
        <div className="px-1 pb-1.5">
          <ThemeToggle />
        </div>
      </div>
      <div className="mt-3 bg-white dark:bg-[#201c18] border border-gray-100 dark:border-[#2e2a24] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2e2a24]">
          <p className="text-base font-semibold text-gray-900 dark:text-[#eae5de]">Account</p>
          <p className="text-sm text-gray-600 dark:text-[#a49c90] mt-0.5">{session?.user?.email ?? "Signed in"}</p>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}
