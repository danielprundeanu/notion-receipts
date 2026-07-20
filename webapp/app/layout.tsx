import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Work_Sans, DM_Serif_Text } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import ThemeProvider from "@/components/ThemeProvider";

const dmSerifText = DM_Serif_Text({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Meal Planner",
  description: "Personal meal planning app",
  appleWebApp: {
    capable: true,
    title: "Meal Planner",
    statusBarStyle: "default",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${workSans.variable} ${dmSerifText.variable}`}>
      <body className={workSans.className}>
        {/* Anti-flash: apply the `dark` class before first paint, mirroring ThemeProvider's
            logic (localStorage 'theme' → prefers-color-scheme). Prevents a white flash on a
            cold load with dark theme, especially in the installed PWA. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`,
          }}
        />
        <ThemeProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              {children}
              {/* Spacer clears the fixed BottomNav on mobile — real content
                  element, since scroll-container padding is unreliable here. */}
              <div className="mobile-safe-pb" aria-hidden />
            </main>
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
