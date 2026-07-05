"use client";

import { usePathname } from "next/navigation";
import Header from "@/components/Header";
import CartBar from "@/components/CartBar";
import Footer from "@/components/Footer";

// Sections that render their own full-page chrome (no main site header/footer).
const BARE_PREFIXES = ["/eldhus", "/kassi", "/bokhald", "/vinnsla", "/verdskanni"];

export default function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  // "/" is the landing page (its own full-page design); the webshop now lives at /vefverslun.
  const bare = pathname === "/" || BARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (bare) return <>{children}</>;

  return (
    <div className="bg-gray-50 text-gray-900 min-h-screen pb-24 sm:pb-0">
      <Header />
      <main>{children}</main>
      <CartBar />
      <Footer />
    </div>
  );
}
