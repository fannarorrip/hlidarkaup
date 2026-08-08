import type { Metadata } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import SiteChrome from "@/components/SiteChrome";

const inter = Inter({ subsets: ["latin", "latin-ext"] });
// Eina serif-hreyfingin (sama og eldhúsið notar) — fyrirsagnir vefverslunar í gegnum
// Tailwind `font-serif` (--font-serif breytan hér að neðan).
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], weight: ["500", "600", "700"], variable: "--font-serif" });

export const metadata: Metadata = {
  title: "Hlíðarkaup",
  description: "Pantaðu og sæktu í verslunina",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="is">
      <body className={`${inter.className} ${fraunces.variable} min-h-screen`}>
        <CartProvider>
          <SiteChrome>{children}</SiteChrome>
        </CartProvider>
      </body>
    </html>
  );
}
