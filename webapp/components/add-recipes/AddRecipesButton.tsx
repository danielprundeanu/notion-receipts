"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import AddRecipes from "./AddRecipes";

// The + in the Recipes header: opens Add recipes; new recipes show up when it's done.
export default function AddRecipesButton() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add recipes"
        title="Add recipes"
        className="flex items-center justify-center w-11 h-11 rounded-[14px] bg-orange-700 text-white hover:bg-orange-800 dark:bg-orange-500 dark:text-[#1a1714] dark:hover:bg-orange-400 transition-colors"
      >
        <Plus size={22} />
      </button>
      {open && <AddRecipes onClose={() => setOpen(false)} onAdded={() => router.refresh()} />}
    </>
  );
}
