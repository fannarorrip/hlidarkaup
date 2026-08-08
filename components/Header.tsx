"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { useCart } from "@/lib/cart-context";
import { ShoppingCartIcon } from "@heroicons/react/24/outline";

// Flatur, ljós haus: logo í eigin litum á hvítu, þunn lína að neðan, karfan sem
// blek-takki með rauðri talningu — rauði borðinn vék fyrir ritstjórnarlegra yfirbragði.
export default function Header() {
  const { count, total } = useCart();

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex-shrink-0 flex items-center gap-3">
          <Logo height={44} />
          <span className="hidden md:block text-[11px] uppercase tracking-[0.18em] text-brand-muted border-l border-gray-200 pl-3">
            Vefverslun · Sauðárkróki
          </span>
        </Link>

        <Link
          href="/cart"
          className="flex items-center gap-2 bg-brand-ink text-white font-semibold px-4 py-2 rounded-md hover:bg-brand-deep transition-colors flex-shrink-0"
        >
          <ShoppingCartIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Karfa</span>
          {count > 0 && (
            <>
              <span
                key={count}
                className="bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded animate-cart-pop tabular-nums"
              >
                {count}
              </span>
              <span className="hidden sm:inline text-sm font-medium text-white/70 tabular-nums">
                {total.toLocaleString("is-IS")} kr.
              </span>
            </>
          )}
        </Link>
      </div>
    </header>
  );
}
