"use client";

import { C } from "./theme";
import { useBox } from "./box-context";

export default function AddToBoxButton({ slug, large = false }: { slug: string; large?: boolean }) {
  const { isSelected, isFull, addMeal, removeMeal } = useBox();
  const selected = isSelected(slug);
  const disabled = !selected && isFull;

  const base = large
    ? "w-full sm:w-auto px-8 py-4 rounded-full font-bold shadow-sm"
    : "w-full py-2.5 rounded-full font-bold text-sm";

  if (selected) {
    return (
      <button
        onClick={() => removeMeal(slug)}
        className={`${base} transition-transform active:scale-95`}
        style={{ backgroundColor: C.deep, color: "#fff" }}
      >
        ✓ Í kassanum
      </button>
    );
  }

  return (
    <button
      onClick={() => addMeal(slug)}
      disabled={disabled}
      title={disabled ? "Kassinn er fullur" : undefined}
      className={`${base} transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ backgroundColor: C.red, color: "#fff" }}
    >
      {disabled ? "Kassinn fullur" : "Bæta í kassann"}
    </button>
  );
}
