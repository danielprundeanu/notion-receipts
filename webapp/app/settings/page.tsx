import ThemeToggle from "@/components/ThemeToggle";

export default function SettingsPage() {
  return (
    <div className="p-4 md:p-8 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-[#e3e3e3]">Setări</h1>
        <p className="text-sm text-gray-600 dark:text-[#9a9a9a] mt-0.5">Preferințe aplicație</p>
      </div>

      {/* Aspect */}
      <div className="bg-white dark:bg-[#1f1f1f] border border-gray-100 dark:border-[#2e2e2e] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-[#2e2e2e]">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-[#e3e3e3]">Aspect</h2>
          <p className="text-xs text-gray-500 dark:text-[#787878] mt-0.5">Alege tema aplicației</p>
        </div>
        <div className="px-1 py-1.5">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
