"use client";

import { useActionState } from "react";
import { LogIn, Loader2 } from "lucide-react";
import { login } from "./actions";

export default function LoginPage() {
  const [errorMessage, formAction, isPending] = useActionState(login, undefined);

  return (
    // Fixed overlay covers the sidebar / bottom nav while logged out.
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-bg-base)]">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center mb-3">
            <LogIn size={22} />
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-[#eae5de]">Meal Planner</h1>
          <p className="text-sm text-gray-500 dark:text-[#7c756a] mt-1">Autentifică-te pentru a continua</p>
        </div>

        <form action={formAction} className="space-y-3">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-gray-600 dark:text-[#a49c90] mb-1">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-[#eae5de]"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-gray-600 dark:text-[#a49c90] mb-1">
              Parolă
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 text-sm bg-white dark:bg-[#24211c] border border-gray-200 dark:border-[#3a352e] rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent text-gray-900 dark:text-[#eae5de]"
            />
          </div>

          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-2.5 bg-orange-500 text-white rounded-lg text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {isPending ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
            Autentificare
          </button>
        </form>
      </div>
    </div>
  );
}
