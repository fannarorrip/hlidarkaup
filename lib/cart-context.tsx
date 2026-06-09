"use client";

import { createContext, useContext, useReducer, ReactNode } from "react";
import { CartItem, Product } from "./types";

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: "ADD"; product: Product }
  | { type: "REMOVE"; productId: string }
  | { type: "CLEAR" }
  | { type: "SET_QTY"; productId: string; quantity: number };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const existing = state.items.find((i) => i.product.id === action.product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === action.product.id ? { ...i, quantity: i.quantity + 1 } : i
          ),
        };
      }
      return { items: [...state.items, { product: action.product, quantity: 1 }] };
    }
    case "REMOVE":
      return { items: state.items.filter((i) => i.product.id !== action.productId) };
    case "SET_QTY":
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.product.id !== action.productId) };
      }
      return {
        items: state.items.map((i) =>
          i.product.id === action.productId ? { ...i, quantity: action.quantity } : i
        ),
      };
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

const CartContext = createContext<{
  items: CartItem[];
  add: (product: Product) => void;
  remove: (productId: string) => void;
  setQty: (productId: string, quantity: number) => void;
  clear: () => void;
  total: number;
  count: number;
} | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  const total = state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);
  const count = state.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        add: (product) => dispatch({ type: "ADD", product }),
        remove: (productId) => dispatch({ type: "REMOVE", productId }),
        setQty: (productId, quantity) => dispatch({ type: "SET_QTY", productId, quantity }),
        clear: () => dispatch({ type: "CLEAR" }),
        total,
        count,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
