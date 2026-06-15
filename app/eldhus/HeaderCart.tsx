"use client";

import Link from "next/link";
import { C } from "./theme";
import { useBox } from "./box-context";

export default function HeaderCart() {
  const { count } = useBox();
  return (
    <Link
      href="/eldhus/karfa"
      aria-label="Karfan"
      className="relative flex items-center justify-center w-11 h-11 rounded-full transition-colors"
      style={{ backgroundColor: C.tealSoft, color: C.deep }}
    >
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      {count > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-[11px] font-bold flex items-center justify-center"
          style={{ backgroundColor: C.red, color: "#fff" }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
