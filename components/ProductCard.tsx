"use client";

import { useState } from "react";
import Link from "next/link";
import { Product } from "@/lib/types";
import { useCart } from "@/lib/cart-context";
import { MinusIcon, PlusIcon, CheckIcon } from "@heroicons/react/24/solid";

// Flatt, ritstjórnarlegt vörukort: þunnur rammi í stað skugga, flokkur í djúpbláu,
// verð feitletrað með tabular-tölum, rauður kaup-takki. Engin emoji-sirkus —
// myndlausar vörur (sjaldgæft, API krefst myndar) fá upphafsstaf á teal-fleti.
function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0)
    return (
      <span className="absolute top-2 left-2 bg-brand-ink text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
        Ekki til á lager
      </span>
    );
  if (stock <= 4)
    return (
      <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
        Fátt eftir
      </span>
    );
  return null;
}

export default function ProductCard({ product }: { product: Product }) {
  const { add, setQty, items } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const cartItem = items.find((i) => i.product.id === product.id);
  const qty = cartItem?.quantity ?? 0;
  const soldOut = product.stock !== undefined && product.stock <= 0;
  const atStockLimit = product.stock !== undefined && qty >= product.stock;

  function handleAdd() {
    if (soldOut || atStockLimit) return;
    add(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 700);
  }

  return (
    <div className={`bg-white border rounded-md flex flex-col group transition-colors ${
      soldOut ? "border-gray-200 opacity-70" : "border-gray-200 hover:border-brand-ink"}`}>
      {/* Mynd — opnar vöruspjaldið (innihald + næringargildi) */}
      <Link
        href={`/vefverslun/vara/${encodeURIComponent(product.id)}`}
        className="relative h-44 flex items-center justify-center select-none"
      >
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.name} className="h-40 w-full object-contain p-2" />
        ) : (
          <span className="w-full h-full flex items-center justify-center bg-brand-tealsoft rounded-t-md font-serif text-4xl text-brand-deep">
            {product.name.charAt(0).toUpperCase()}
          </span>
        )}
        {product.stock !== undefined && <StockBadge stock={product.stock} />}
      </Link>

      <div className="p-3 flex flex-col flex-1 border-t border-gray-100">
        {product.category && (
          <span className="text-[10px] font-semibold text-brand-deep uppercase tracking-wider">
            {product.category}
          </span>
        )}
        <h3 className="font-medium text-brand-ink text-sm leading-snug mt-0.5 flex-1">
          <Link href={`/vefverslun/vara/${encodeURIComponent(product.id)}`} className="hover:underline underline-offset-2">
            {product.name}
          </Link>
        </h3>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-brand-ink tabular-nums">
            {product.price.toLocaleString("is-IS")} kr.
          </span>

          {soldOut ? (
            <span className="text-xs text-gray-400 font-medium">Uppselt</span>
          ) : qty === 0 ? (
            <button
              onClick={handleAdd}
              className={`text-white text-sm font-semibold px-3 py-1.5 rounded transition-colors flex items-center gap-1 ${
                justAdded ? "bg-green-600" : "bg-brand-red hover:bg-brand-red-dark"
              }`}
            >
              {justAdded ? (
                <>
                  <CheckIcon className="w-4 h-4" />
                  Í körfu
                </>
              ) : (
                "+ Í körfu"
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setQty(product.id, qty - 1)}
                className="w-7 h-7 rounded border border-gray-300 hover:border-brand-ink flex items-center justify-center transition-colors"
                aria-label="Fækka"
              >
                <MinusIcon className="w-3.5 h-3.5 text-brand-ink" />
              </button>
              <span className="w-5 text-center font-bold text-sm tabular-nums">{qty}</span>
              <button
                onClick={handleAdd}
                disabled={atStockLimit}
                className="w-7 h-7 rounded bg-brand-red hover:bg-brand-red-dark flex items-center justify-center transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                aria-label="Fjölga"
              >
                <PlusIcon className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
