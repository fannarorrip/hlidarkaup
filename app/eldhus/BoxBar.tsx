"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { C } from "./theme";
import { useBox } from "./box-context";

export default function BoxBar() {
  const { count, target, total } = useBox();
  const pathname = usePathname();

  // Hidden when empty or already on the cart page
  if (count === 0 || pathname === "/eldhus/karfa" || pathname === "/eldhus/ganga-fra") return null;

  return (
    <Link
      href="/eldhus/karfa"
      className="fixed bottom-5 right-5 z-50 flex items-center gap-3 pl-5 pr-4 py-3 rounded-full shadow-xl transition-transform active:scale-95"
      style={{ backgroundColor: C.red, color: "#fff" }}
    >
      <span className="font-bold">Karfan · {count}/{target}</span>
      <span className="text-sm opacity-90">{total.toLocaleString("is-IS")} kr.</span>
      <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-lg">→</span>
    </Link>
  );
}
