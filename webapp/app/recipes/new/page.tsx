import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import RecipeForm from "@/components/RecipeForm";

export default function NewRecipePage() {
  return (
    <div>
      <div className="border-b border-gray-100 bg-white px-8 py-3 flex items-center gap-3">
        <Link href="/recipes" className="text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <h1 className="text-base font-semibold text-gray-900">New recipe</h1>
      </div>
      <RecipeForm />
    </div>
  );
}
