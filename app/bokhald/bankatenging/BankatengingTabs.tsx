"use client";
import { useState, type ReactNode } from "react";

export interface BankTab { key: string; label: string; icon: string; node: ReactNode; badge?: number }

// Client tab shell. All panels are rendered once and toggled with `hidden` so client
// components (ArionCards/ArionPsd2) keep their state across tab switches.
export default function BankatengingTabs({ tabs }: { tabs: BankTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActive(t.key)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg -mb-px border-b-2 transition-colors flex items-center gap-2 ${
              active === t.key
                ? "border-red-600 text-red-700 bg-red-50/40"
                : "border-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
            {!!t.badge && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 tabular-nums">{t.badge}</span>
            )}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} className={active === t.key ? "" : "hidden"}>
          {t.node}
        </div>
      ))}
    </div>
  );
}
