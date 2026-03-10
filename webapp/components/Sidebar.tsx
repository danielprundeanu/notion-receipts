"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Calendar, ShoppingCart, ChefHat, Apple } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

const nav = [
  { href: "/recipes", label: "Recipes", icon: BookOpen },
  { href: "/planner", label: "Planner", icon: Calendar },
  { href: "/grocery-list", label: "Grocery List", icon: ShoppingCart },
  { href: "/ingredients", label: "Ingredients", icon: Apple },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col w-56 bg-white dark:bg-slate-800 border-r border-gray-100 dark:border-slate-700 shrink-0 transition-colors duration-200">
      {/* Brand header */}
      <div className="p-5 border-b border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center">
            <ChefHat size={16} className="text-white" />
          </div>
          <span className="font-semibold text-gray-900 dark:text-slate-100">Meal Planner</span>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 p-3 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? "bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400"
                  : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 hover:text-gray-900 dark:hover:text-slate-100"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle — pinned to the bottom */}
      <div className="p-3 border-t border-gray-100 dark:border-slate-700">
        <ThemeToggle />
      </div>
    </aside>
  );
}
