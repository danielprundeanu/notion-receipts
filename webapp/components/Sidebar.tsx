"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/recipes", label: "Recipes", img: "/icons/recipes.webp" },
  { href: "/planner", label: "Planner", img: "/icons/planner.webp" },
  { href: "/grocery-list", label: "Grocery list", img: "/icons/grocery.webp" },
  { href: "/ingredients", label: "Ingredients", img: "/icons/ingredients.webp" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-56 bg-white dark:bg-[#201c18] border-r border-gray-100 dark:border-[#2e2a24] shrink-0 transition-colors duration-200">
      {/* Brand header */}
      <div className="p-5 border-b border-gray-100 dark:border-[#2e2a24]">
        <div className="flex items-center gap-2.5">
          <Image src="/logo.png" alt="Meal Planner" width={32} height={32} className="w-8 h-8 rounded-lg shrink-0" />
          <span className="font-semibold text-gray-900 dark:text-[#eae5de]">Meal Planner</span>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, img }) => {
          // Exact match for /recipes to avoid matching /recipes/import
          const active =
            href === "/recipes"
              ? pathname === "/recipes" || (pathname.startsWith("/recipes/") && !pathname.startsWith("/recipes/import"))
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400"
                  : "text-gray-600 dark:text-[#a49c90] hover:bg-gray-50 dark:hover:bg-[#2a2620] hover:text-gray-900 dark:hover:text-[#eae5de]"
              }`}
            >
              <Image src={img} alt="" width={20} height={20} className={`transition-opacity ${active ? "opacity-100" : "opacity-60"}`} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Settings — pinned to the bottom */}
      <div className="p-3 border-t border-gray-100 dark:border-[#2e2a24]">
        <Link
          href="/settings"
          aria-current={pathname === "/settings" || pathname.startsWith("/settings/") ? "page" : undefined}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            pathname === "/settings" || pathname.startsWith("/settings/")
              ? "bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400"
              : "text-gray-600 dark:text-[#a49c90] hover:bg-gray-50 dark:hover:bg-[#2a2620] hover:text-gray-900 dark:hover:text-[#eae5de]"
          }`}
        >
          <Image
            src="/icons/settings.webp"
            alt=""
            width={20}
            height={20}
            className={`transition-opacity ${pathname === "/settings" || pathname.startsWith("/settings/") ? "opacity-100" : "opacity-60"}`}
          />
          Settings
        </Link>
      </div>
    </aside>
  );
}
