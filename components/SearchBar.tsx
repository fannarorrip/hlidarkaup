"use client";

import { useState, useEffect, useRef } from "react";
import { MagnifyingGlassIcon, ClockIcon } from "@heroicons/react/24/outline";
import { getSearchHistory, saveSearchHistory, clearSearchHistory } from "@/lib/search-history";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function SearchBar({ value, onChange }: Props) {
  const [history, setHistory] = useState<string[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  function refreshHistory() {
    setHistory(getSearchHistory());
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleFocus() {
    refreshHistory();
    setShowHistory(true);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && value.trim().length >= 2) {
      saveSearchHistory(value.trim());
      setShowHistory(false);
    }
    if (e.key === "Escape") setShowHistory(false);
  }

  function selectHistory(item: string) {
    onChange(item);
    setShowHistory(false);
  }

  function handleClearHistory() {
    clearSearchHistory();
    setHistory([]);
    setShowHistory(false);
  }

  const visibleHistory = value.trim().length > 0
    ? history.filter((h) => h.toLowerCase().includes(value.toLowerCase()) && h !== value)
    : history;

  return (
    <div className="relative" ref={wrapperRef}>
      <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none z-10" />
      <input
        type="search"
        placeholder="Leitaðu að vöru..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        className="w-full pl-11 pr-4 py-3 text-base border-2 border-gray-200 rounded-xl focus:outline-none focus:border-brand-red transition-colors bg-white shadow-sm"
      />

      {/* Recent searches dropdown */}
      {showHistory && visibleHistory.length > 0 && (
        <div className="absolute top-full mt-2 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nýlegar leitir</span>
            <button
              onMouseDown={(e) => { e.preventDefault(); handleClearHistory(); }}
              className="text-xs text-gray-400 hover:text-brand-red transition-colors font-medium"
            >
              Hreinsa allt
            </button>
          </div>
          {visibleHistory.map((item, i) => (
            <button
              key={i}
              onMouseDown={(e) => { e.preventDefault(); selectHistory(item); }}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 text-left transition-colors group"
            >
              <ClockIcon className="w-4 h-4 text-gray-400 group-hover:text-brand-red flex-shrink-0 transition-colors" />
              <span className="text-sm text-gray-700 group-hover:text-brand-red transition-colors">{item}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
