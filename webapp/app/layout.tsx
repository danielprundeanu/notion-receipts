import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import ThemeProvider from "@/components/ThemeProvider";

const inter = Inter({ subsets: ["latin"] });

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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>
          <div className="flex h-screen">
            <Sidebar />
            <main className="flex-1 overflow-auto mobile-safe-pb">
              {children}
            </main>
          </div>
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  );
}
