import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import Providers from "@/components/Providers";

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
      <body className="min-h-full bg-background text-foreground antialiased">
        <Providers>
          {children}
          <Toaster position="top-center" richColors dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
