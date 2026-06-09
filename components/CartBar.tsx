"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/lib/cart-context";
import { ShoppingCartIcon } from "@heroicons/react/24/solid";

export default function CartBar() {
  const { count, total } = useCart();
  const pathname = usePathname();

  if (count === 0) return null;
  if (pathname === "/cart" || pathname === "/checkout" || pathname === "/confirmation") return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 sm:hidden z-50">
      <Link
        href="/cart"
        className="flex items-center justify-between bg-brand-red text-white rounded-2xl px-5 py-4 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <ShoppingCartIcon className="w-5 h-5" />
          <span className="font-bold">{count} vara{count !== 1 ? "r" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-bold">{total.toLocaleString("is-IS")} kr.</span>
          <span className="text-red-200">→</span>
        </div>
      </Link>
    </div>
  );
}
