"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Calendar, ShoppingCart, Apple, Download } from "lucide-react";

const nav = [
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/planner", label: "Planner", icon: Calendar },
  { href: "/grocery-list", label: "Grocery", icon: ShoppingCart },
  { href: "/ingredients", label: "Ingredients", icon: Apple },
  { href: "/recipes/import", label: "Import", icon: Download },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1f1f1f] border-t border-gray-100 dark:border-[#2e2e2e] flex md:hidden z-40 transition-colors duration-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {nav.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/recipes"
            ? pathname === "/recipes" || (pathname.startsWith("/recipes/") && !pathname.startsWith("/recipes/import"))
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
              active
                ? "text-orange-600 dark:text-orange-400"
                : "text-gray-400 dark:text-[#555555]"
            }`}
          >
            <Icon size={21} />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}

    </nav>
  );
}
