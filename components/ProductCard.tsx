"use client";

import { useState } from "react";
import Link from "next/link";
import { Product } from "@/lib/types";
import { useCart } from "@/lib/cart-context";
import { MinusIcon, PlusIcon, CheckIcon } from "@heroicons/react/24/solid";

const CATEGORY_EMOJI: Record<string, string> = {
  "Mjólkurvörur": "🥛",
  "Bakkelsi": "🍞",
  "Ávextir & grænmeti": "🥦",
  "Kjöt": "🥩",
  "Þurrvarningur": "🥫",
  "Fiskur": "🐟",
  "Drykkir": "🧃",
  "Snyrtivörur": "🧴",
  "Hreinlætis­vörur": "🧹",
};

function StockBadge({ stock }: { stock: number }) {
  if (stock <= 0)
    return (
      <span className="absolute top-2 left-2 bg-gray-700 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
        Ekki til á lager
      </span>
    );
  if (stock <= 4)
    return (
      <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
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
  const emoji = CATEGORY_EMOJI[product.category ?? ""] ?? "🛒";
  const soldOut = product.stock !== undefined && product.stock <= 0;
  const atStockLimit = product.stock !== undefined && qty >= product.stock;

  function handleAdd() {
    if (soldOut || atStockLimit) return;
    add(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 700);
  }

  return (
    <div
      className={`bg-white border rounded-2xl shadow-sm hover:shadow-md transition-all flex flex-col group ${
        soldOut ? "border-gray-200 opacity-70" : "border-gray-100"
      } ${justAdded ? "scale-[1.03]" : "scale-100"} transition-transform duration-200`}
    >
      {/* Image / emoji area — opens the product page (innihald + næringargildi) */}
      <Link
        href={`/vefverslun/vara/${encodeURIComponent(product.id)}`}
        className="relative bg-gradient-to-br from-red-50 to-white h-32 rounded-t-2xl flex items-center justify-center text-5xl select-none"
      >
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.image} alt={product.name} className="h-24 w-full object-contain p-2" />
        ) : (
          emoji
        )}
        {product.stock !== undefined && <StockBadge stock={product.stock} />}
      </Link>

      <div className="p-3 flex flex-col flex-1">
        {product.category && (
          <span className="text-xs font-medium text-brand-red uppercase tracking-wide">
            {product.category}
          </span>
        )}
        <h3 className="font-semibold text-gray-900 text-sm leading-snug mt-0.5 flex-1">
          <Link href={`/vefverslun/vara/${encodeURIComponent(product.id)}`} className="hover:text-brand-red">
            {product.name}
          </Link>
        </h3>
        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{product.description}</p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-base font-bold text-gray-900">
            {product.price.toLocaleString("is-IS")} kr.
          </span>

          {soldOut ? (
            <span className="text-xs text-gray-400 font-medium">Ekki til á lager</span>
          ) : qty === 0 ? (
            <button
              onClick={handleAdd}
              className={`text-white text-sm font-bold px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1 ${
                justAdded
                  ? "bg-green-500 scale-110"
                  : "bg-brand-red hover:bg-brand-red-dark"
              }`}
            >
              {justAdded ? (
                <>
                  <CheckIcon className="w-4 h-4" />
                  Bætt!
                </>
              ) : (
                "+ Bæta við"
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setQty(product.id, qty - 1)}
                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center transition-colors"
              >
                <MinusIcon className="w-3.5 h-3.5 text-gray-700" />
              </button>
              <span className="w-5 text-center font-bold text-sm">{qty}</span>
              <button
                onClick={handleAdd}
                disabled={atStockLimit}
                className="w-7 h-7 rounded-full bg-brand-red hover:bg-brand-red-dark flex items-center justify-center transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
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
