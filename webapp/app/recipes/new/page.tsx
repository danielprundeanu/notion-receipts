import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RecipeForm from "@/components/RecipeForm";

export default function NewRecipePage() {
  return (
    <div>
      <div className="border-b border-gray-100 dark:border-[#2e2e2e] bg-white dark:bg-[#1f1f1f] px-4 md:px-8 py-3 flex items-center gap-3">
        <Link href="/recipes" className="text-gray-500 dark:text-[#787878] hover:text-gray-700 dark:hover:text-[#9a9a9a] transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-base font-semibold text-gray-900 dark:text-[#e3e3e3]">New recipe</h1>
      </div>
      <RecipeForm />
    </div>
  );
}
