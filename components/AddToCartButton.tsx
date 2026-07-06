"use client";

import { useState } from "react";
import { Product } from "@/lib/types";
import { useCart } from "@/lib/cart-context";
import { MinusIcon, PlusIcon, CheckIcon } from "@heroicons/react/24/solid";

// Cart controls for the product-detail page (vefverslun/vara/[nr]) — same
// behaviour as the card in the grid, sized for a detail view.
export default function AddToCartButton({ product }: { product: Product }) {
  const { add, setQty, items } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const qty = items.find((i) => i.product.id === product.id)?.quantity ?? 0;
  const soldOut = product.stock !== undefined && product.stock <= 0;
  const atStockLimit = product.stock !== undefined && qty >= product.stock;

  function handleAdd() {
    if (soldOut || atStockLimit) return;
    add(product);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 700);
  }

  if (soldOut) return <span className="text-sm text-gray-400 font-medium">Ekki til á lager</span>;

  if (qty === 0)
    return (
      <button
        onClick={handleAdd}
        className={`text-white font-bold px-6 py-3 rounded-xl transition-all duration-200 flex items-center gap-2 ${
          justAdded ? "bg-green-500 scale-105" : "bg-brand-red hover:bg-brand-red-dark"
        }`}
      >
        {justAdded ? (<><CheckIcon className="w-5 h-5" />Bætt í körfu!</>) : "+ Bæta í körfu"}
      </button>
    );

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setQty(product.id, qty - 1)}
        className="w-10 h-10 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center transition-colors"
      >
        <MinusIcon className="w-4 h-4 text-gray-700" />
      </button>
      <span className="w-8 text-center font-bold">{qty}</span>
      <button
        onClick={handleAdd}
        disabled={atStockLimit}
        className="w-10 h-10 rounded-full bg-brand-red hover:bg-brand-red-dark flex items-center justify-center transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
      >
        <PlusIcon className="w-4 h-4 text-white" />
      </button>
      <span className="ml-2 text-sm text-gray-500">í körfunni</span>
    </div>
  );
}
