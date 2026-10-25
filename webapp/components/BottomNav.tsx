"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ListChecks, LayoutGrid, type LucideIcon } from "lucide-react";

// Four tabs for the things used daily; Ingredients, Import and Settings live under More.
const nav: { href: string; label: string; Icon: LucideIcon; match: (p: string) => boolean }[] = [
  {
    href: "/recipes",
    label: "Recipes",
    Icon: BookOpen,
    match: (p) => p === "/recipes" || (p.startsWith("/recipes/") && !p.startsWith("/recipes/import")),
  },
  { href: "/planner", label: "Plan", Icon: CalendarDays, match: (p) => p.startsWith("/planner") },
  { href: "/grocery-list", label: "Shop", Icon: ListChecks, match: (p) => p.startsWith("/grocery-list") },
  {
    href: "/more",
    label: "More",
    Icon: LayoutGrid,
    match: (p) =>
      p.startsWith("/more") || p.startsWith("/ingredients") || p.startsWith("/settings") || p.startsWith("/recipes/import"),
  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#201c18] border-t border-gray-100 dark:border-[#2e2a24] flex md:hidden z-40 px-1.5 transition-colors duration-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {nav.map(({ href, label, Icon, match }) => {
        const active = match(pathname);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 pt-1.5 pb-2 transition-colors ${
              active ? "text-orange-600 dark:text-orange-400" : "text-gray-600 dark:text-[#a49c90]"
            }`}
          >
            <span
              className={`w-14 h-8 rounded-full flex items-center justify-center transition-colors ${
                active ? "bg-orange-100 dark:bg-orange-500/15" : ""
              }`}
            >
              <Icon size={21} strokeWidth={active ? 2.25 : 2} />
            </span>
            <span className={`text-xs ${active ? "font-semibold" : "font-medium"}`}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
