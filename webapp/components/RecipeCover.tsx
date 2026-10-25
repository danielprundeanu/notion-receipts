import Image from "next/image";

// next/image throws at render for any remote host not in next.config remotePatterns —
// and since lists map every recipe, one bad host would crash the WHOLE page. Local
// paths and Vercel Blob URLs are configured/safe; anything else remote (e.g. a cover
// hotlinked from the site a recipe was imported from) falls back to a plain <img> so
// it renders (unoptimized) instead of taking the page down.
function isOptimizableSrc(url: string): boolean {
  return url.startsWith("/") || url.includes(".public.blob.vercel-storage.com");
}

// Fills its nearest positioned ancestor (the parent needs `relative` + a size).
// `onError` (client callers only) lets a caller swap in a placeholder when the image can't
// load — e.g. a source site that blocks hotlinking.
// `loading="eager"` for an above-the-fold cover (a recipe's hero), so it isn't held back.
export default function RecipeCover({
  src, alt, sizes, onError, loading = "lazy",
}: { src: string; alt: string; sizes: string; onError?: () => void; loading?: "lazy" | "eager" }) {
  if (isOptimizableSrc(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} className="object-cover" loading={loading} onError={onError} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading={loading} className="absolute inset-0 h-full w-full object-cover" onError={onError} />;
}
