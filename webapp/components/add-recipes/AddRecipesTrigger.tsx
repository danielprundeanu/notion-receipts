"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import AddRecipes from "./AddRecipes";

// Opens Add recipes from a page that isn't Recipes (the More list): the caller passes the
// row's look as children. Closing after something was added goes to Recipes, where the new
// ones are at the top.
export default function AddRecipesTrigger({ className, children }: { className: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const addedAny = useRef(false);
  const router = useRouter();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className={className}>
        {children}
      </button>
      {open && (
        <AddRecipes
          onClose={() => {
            setOpen(false);
            if (addedAny.current) router.push("/recipes");
          }}
          onAdded={(ids) => {
            if (ids.length) addedAny.current = true;
          }}
        />
      )}
    </>
  );
}
