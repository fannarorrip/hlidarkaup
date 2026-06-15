"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Placeholder pricing — confirm real numbers before launch.
export const PRICE_PER_SERVING = 1890; // kr per serving (household size × meals)
export const PORTION_OPTIONS = [2, 4] as const;
export const MEAL_OPTIONS = [3, 4, 5] as const;

interface BoxState {
  portions: number; // people per meal (2 or 4)
  target: number;   // meals per week (3/4/5)
  selected: string[]; // chosen meal slugs
}

interface BoxContextValue extends BoxState {
  count: number;
  isFull: boolean;
  pricePerServing: number;
  total: number;
  isSelected: (slug: string) => boolean;
  addMeal: (slug: string) => void;
  removeMeal: (slug: string) => void;
  setPortions: (n: number) => void;
  setTarget: (n: number) => void;
  clear: () => void;
}

const KEY = "svogott-box";
const DEFAULT: BoxState = { portions: 2, target: 4, selected: [] };

const Ctx = createContext<BoxContextValue | null>(null);

export function BoxProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BoxState>(DEFAULT);
  const [loaded, setLoaded] = useState(false);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...DEFAULT, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);

  // persist
  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(state));
  }, [state, loaded]);

  const value = useMemo<BoxContextValue>(() => {
    const count = state.selected.length;
    return {
      ...state,
      count,
      isFull: count >= state.target,
      pricePerServing: PRICE_PER_SERVING,
      total: state.target * state.portions * PRICE_PER_SERVING,
      isSelected: (slug) => state.selected.includes(slug),
      addMeal: (slug) =>
        setState((s) =>
          s.selected.includes(slug) || s.selected.length >= s.target
            ? s
            : { ...s, selected: [...s.selected, slug] },
        ),
      removeMeal: (slug) => setState((s) => ({ ...s, selected: s.selected.filter((x) => x !== slug) })),
      setPortions: (n) => setState((s) => ({ ...s, portions: n })),
      // never let target drop below what's already selected
      setTarget: (n) => setState((s) => ({ ...s, target: n, selected: s.selected.slice(0, n) })),
      clear: () => setState((s) => ({ ...s, selected: [] })),
    };
  }, [state, loaded]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBox() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBox must be used within BoxProvider");
  return ctx;
}
