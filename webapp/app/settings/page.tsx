import ThemeToggle from "@/components/ThemeToggle";
import SignOutButton from "@/components/SignOutButton";
import { auth } from "@/auth";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="p-4 md:p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[#eae5de]">Settings</h1>
        <p className="text-sm text-gray-600 dark:text-[#a49c90] mt-0.5">App preferences</p>
      </div>

      {/* Aspect */}
      <div className="bg-white dark:bg-[#201c18] border border-gray-100 dark:border-[#2e2a24] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2e2a24]">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-[#eae5de]">Appearance</h2>
          <p className="text-xs text-gray-500 dark:text-[#7c756a] mt-0.5">Choose the app theme</p>
        </div>
        <div className="px-1 py-1.5">
          <ThemeToggle />
        </div>
      </div>

      {/* Cont */}
      <div className="mt-4 bg-white dark:bg-[#201c18] border border-gray-100 dark:border-[#2e2a24] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2e2a24]">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-[#eae5de]">Account</h2>
          <p className="text-xs text-gray-500 dark:text-[#7c756a] mt-0.5">
            {session?.user?.email ?? "Signed in"}
          </p>
        </div>
        <SignOutButton />
      </div>
    </div>
  );
}
