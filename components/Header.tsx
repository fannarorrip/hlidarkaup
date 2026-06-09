"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { useCart } from "@/lib/cart-context";
import { ShoppingCartIcon } from "@heroicons/react/24/outline";

export default function Header() {
  const { count, total } = useCart();

  return (
    <header className="bg-brand-red shadow-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-20 flex items-center justify-between gap-4">
        <Link href="/" className="flex-shrink-0">
          <Logo height={56} inverted />
        </Link>

        <Link
          href="/cart"
          className="flex items-center gap-2 bg-white text-brand-red font-bold px-4 py-2 rounded-xl hover:bg-red-50 transition-colors flex-shrink-0"
        >
          <ShoppingCartIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Karfa</span>
          {count > 0 && (
            <>
              <span
                key={count}
                className="bg-brand-red text-white text-xs font-bold px-2 py-0.5 rounded-full animate-cart-pop"
              >
                {count}
              </span>
              <span className="hidden sm:inline text-sm font-semibold text-gray-600">
                {total.toLocaleString("is-IS")} kr.
              </span>
            </>
          )}
        </Link>
      </div>
    </header>
  );
}
