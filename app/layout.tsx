import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/lib/cart-context";
import Header from "@/components/Header";
import CartBar from "@/components/CartBar";
import Footer from "@/components/Footer";

const inter = Inter({ subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  title: "Hlíðarkaup",
  description: "Pantaðu og sæktu í verslunina",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="is">
      <body className={`${inter.className} bg-gray-50 text-gray-900 min-h-screen pb-24 sm:pb-0`}>
        <CartProvider>
          <Header />
          <main>{children}</main>
          <CartBar />
          <Footer />
        </CartProvider>
      </body>
    </html>
  );
}
