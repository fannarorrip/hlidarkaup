"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { TrashIcon, MinusIcon, PlusIcon } from "@heroicons/react/24/outline";

export default function CartPage() {
  const { items, remove, setQty, total } = useCart();

  if (items.length === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-2xl mb-4">🛒</p>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">Karfan er tóm</h2>
        <Link href="/vefverslun" className="text-brand-red hover:underline font-medium">
          ← Til baka í vörur
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Karfan þín</h1>
      <div className="space-y-4 mb-8">
        {items.map(({ product, quantity }) => (
          <div
            key={product.id}
            className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl p-4"
          >
            <div className="bg-red-50 w-14 h-14 rounded-lg flex items-center justify-center text-2xl flex-shrink-0">
              🛒
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 truncate">{product.name}</p>
              <p className="text-sm text-gray-500">{product.price.toLocaleString("is-IS")} kr. / stk.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty(product.id, quantity - 1)}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <MinusIcon className="w-4 h-4" />
              </button>
              <span className="w-6 text-center font-semibold">{quantity}</span>
              <button
                onClick={() => setQty(product.id, quantity + 1)}
                className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
              </button>
            </div>
            <p className="font-bold text-gray-900 w-24 text-right">
              {(product.price * quantity).toLocaleString("is-IS")} kr.
            </p>
            <button
              onClick={() => remove(product.id)}
              className="text-gray-400 hover:text-red-500 transition-colors ml-2"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <span className="text-lg font-semibold">Samtals</span>
          <span className="text-2xl font-bold text-brand-red">
            {total.toLocaleString("is-IS")} kr.
          </span>
        </div>
        <Link
          href="/checkout"
          className="block w-full text-center bg-brand-red hover:bg-brand-red-dark text-white font-bold py-3 px-6 rounded-xl transition-colors text-lg"
        >
          Halda áfram í greiðslu →
        </Link>
        <Link href="/vefverslun" className="block text-center mt-3 text-sm text-gray-500 hover:text-brand-red">
          ← Halda áfram að versla
        </Link>
      </div>
    </div>
  );
}
