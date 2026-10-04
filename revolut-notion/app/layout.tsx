import type { Metadata } from "next";
import Link from "next/link";
import { Receipt, Settings } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Revolut → Notion",
  description:
    "Importă cheltuielile din screenshot-urile Revolut Analytics direct în Notion.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body className="min-h-screen">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <Receipt className="h-5 w-5 text-orange-500" aria-hidden />
              <span>Revolut → Notion</span>
            </Link>
            <Link
              href="/settings"
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm text-[var(--muted)] transition-colors hover:bg-black/5 hover:text-[var(--foreground)] dark:hover:bg-white/5"
            >
              <Settings className="h-4 w-4" aria-hidden />
              Setări
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
