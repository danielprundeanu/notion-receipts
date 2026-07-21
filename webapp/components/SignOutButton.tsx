"use client";

import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

export default function SignOutButton() {
  return (
    <form action={logout} onSubmit={(e) => { if (!confirm("Sigur te deconectezi?")) e.preventDefault(); }} className="px-1 py-1.5">
      <button
        type="submit"
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
      >
        <LogOut size={15} /> Deconectare
      </button>
    </form>
  );
}
