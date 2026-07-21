"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/recipes", label: "Rețete", img: "/icons/recipes.webp" },
  { href: "/planner", label: "Planificator", img: "/icons/planner.webp" },
  { href: "/grocery-list", label: "Cumpărături", img: "/icons/grocery.webp" },
  { href: "/ingredients", label: "Ingrediente", img: "/icons/ingredients.webp" },
  { href: "/settings", label: "Setări", img: "/icons/settings.webp" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-[#201c18] border-t border-gray-100 dark:border-[#2e2a24] flex md:hidden z-40 transition-colors duration-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {nav.map(({ href, label, img }) => {
        const active =
          href === "/recipes"
            ? pathname === "/recipes" || (pathname.startsWith("/recipes/") && !pathname.startsWith("/recipes/import"))
            : pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${
              active
                ? "text-orange-600 dark:text-orange-400"
                : "text-gray-500 dark:text-[#8a8175]"
            }`}
          >
            <Image
              src={img}
              alt=""
              width={32}
              height={32}
              className={`transition-opacity ${active ? "opacity-100" : "opacity-45"}`}
            />
            <span className="text-[10px] font-medium">{label}</span>
          </Link>
        );
      })}

    </nav>
  );
}
