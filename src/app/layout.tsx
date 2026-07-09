import type { Metadata } from "next";
import "./globals.css";
import { Heebo } from "next/font/google";
import { Toaster } from "sonner";
import Providers from "@/components/Providers";
import QuickActionsButton from "@/components/layout/QuickActionsButton";

const heebo = Heebo({
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "מערכת CRM",
  description: "מערכת ניהול לקוחות, משימות ועובדים",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl" className="h-full">
      <body className={`min-h-full bg-background text-foreground antialiased ${heebo.className}`} suppressHydrationWarning>
        <Providers>
          {children}
          <QuickActionsButton />
          <Toaster position="top-center" richColors dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
