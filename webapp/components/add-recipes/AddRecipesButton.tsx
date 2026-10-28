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
        className="flex items-center justify-center w-11 h-11 rounded-[14px] bg-orange-500 text-gray-900 hover:bg-orange-600 transition-colors"
      >
        <Plus size={22} />
      </button>
      {open && <AddRecipes onClose={() => setOpen(false)} onAdded={() => router.refresh()} />}
    </>
  );
}
