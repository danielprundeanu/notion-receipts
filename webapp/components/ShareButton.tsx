"use client";

import { useState } from "react";
import { Check } from "lucide-react";

// iOS-style share glyph (SF Symbols "square.and.arrow.up") — a box with an up
// arrow out of the top, rather than lucide's Android-style connected-nodes icon.
function IosShareIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2v13" />
      <path d="m8 6 4-4 4 4" />
      <path d="M9 11H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-2" />
    </svg>
  );
}

export default function ShareButton({ id, name }: { id: string; name: string }) {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    // Share the public preview URL (/r/[id]) so link previews render a rich
    // Open Graph card even though the full recipe requires login.
    const url = typeof window !== "undefined" ? `${window.location.origin}/r/${id}` : "";
    if (!url) return;

    // Prefer the native share sheet (mobile); fall back to copying the link.
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: name, url });
        return;
      } catch (err) {
        // User dismissed the share sheet — do nothing.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Otherwise fall through to clipboard.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — last resort: prompt so the user can copy manually.
      window.prompt("Copy recipe link:", url);
    }
  }

  return (
    <button
      onClick={handleShare}
      title={copied ? "Link copied" : "Share"}
      aria-label="Share recipe"
      className="inline-flex items-center justify-center w-10 h-10 text-gray-700 dark:text-[#bab2a6] border border-gray-200 dark:border-[#3a352e] rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:border-orange-300 dark:hover:border-orange-800 hover:text-orange-700 dark:hover:text-orange-400 transition-colors"
    >
      {copied ? <Check size={17} className="text-green-600 dark:text-green-400" /> : <IosShareIcon size={17} />}
    </button>
  );
}
