"use client";

interface Props {
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
}

export default function CategoryFilter({ categories, selected, onSelect }: Props) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onSelect("")}
        className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors whitespace-nowrap ${
          selected === ""
            ? "bg-brand-red text-white border-brand-red"
            : "border-gray-200 text-gray-600 hover:border-brand-red hover:text-brand-red bg-white"
        }`}
      >
        Allt
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className={`px-4 py-2 rounded-full text-sm font-semibold border-2 transition-colors whitespace-nowrap ${
            selected === cat
              ? "bg-brand-red text-white border-brand-red"
              : "border-gray-200 text-gray-600 hover:border-brand-red hover:text-brand-red bg-white"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
