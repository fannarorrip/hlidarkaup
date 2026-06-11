"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import ProductCard from "@/components/ProductCard";
import SearchBar from "@/components/SearchBar";
import CategoryFilter from "@/components/CategoryFilter";
import { Product } from "@/lib/types";
import { saveSearchHistory } from "@/lib/search-history";

const LIMIT = 48;

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const fetchProducts = useCallback(async (q: string, p: number, replace: boolean) => {
    if (p === 0) setInitialLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ search: q, page: String(p), limit: String(LIMIT) });
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts((prev) => replace ? (data.products ?? []) : [...prev, ...(data.products ?? [])]);
      setTotal(data.total ?? 0);
      setPage(p);
      if (q.trim().length >= 2) saveSearchHistory(q.trim());
    } catch {
      if (replace) setProducts([]);
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Don't auto-load on mount — wait for user to search (blank search takes 20s on Regla)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setInitialLoading(false); }, []);

  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!search.trim()) { setProducts([]); setTotal(0); return; }
    const t = setTimeout(() => { fetchProducts(search, 0, true); }, 400);
    setDebounceTimer(t);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    fetchProducts(search, 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[],
    [products]
  );

  const filtered = useMemo(() => {
    if (!category) return products;
    return products.filter((p) => p.category === category);
  }, [products, category]);

  const isSearching = search.trim().length >= 2 || !!category;
  const hasMore = products.length < total && !category;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-brand-red to-brand-red-light rounded-2xl px-6 py-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-1">Velkomin í Hlíðarkaup</h1>
        <p className="text-red-100 text-sm sm:text-base">
          Pantaðu og sæktu í verslunina — opið <strong className="text-white">09:00–22:00</strong>
        </p>
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Categories */}
      {categories.length > 0 && (
        <CategoryFilter categories={categories} selected={category} onSelect={setCategory} />
      )}

      {/* Product grid */}
      <section>
        {isSearching && !initialLoading && (
          <p className="text-sm text-gray-500 mb-3">
            {filtered.length} vara{filtered.length !== 1 ? "r" : ""} fundust
            {total > filtered.length && ` (${total} í heildina)`}
          </p>
        )}
        {!isSearching && !initialLoading && products.length > 0 && (
          <h2 className="text-lg font-bold text-gray-800 mb-3">Allar vörur</h2>
        )}

        {initialLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-2xl h-48 animate-pulse" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filtered.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => fetchProducts(search, page + 1, false)}
                  disabled={loadingMore}
                  className="bg-white border-2 border-brand-red text-brand-red font-bold px-8 py-3 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-60"
                >
                  {loadingMore ? "Hleð..." : `Sýna fleiri vörur (${total - products.length} eftir)`}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-20">
            <p className="text-5xl mb-4">{search.trim() ? "🔍" : "🛒"}</p>
            <p className="text-gray-600 font-semibold text-lg mb-1">
              {search.trim() ? "Engar vörur fundust" : "Leitaðu að vöru til að byrja"}
            </p>
            <p className="text-gray-400 text-sm">
              {search.trim()
                ? "Prófaðu annað leitarorð"
                : "Sláðu inn nafn vöru, vörumerki eða lýsingu"}
            </p>
            {search.trim() && (
              <button
                onClick={() => { setSearch(""); setCategory(""); }}
                className="mt-4 text-brand-red hover:underline text-sm font-medium"
              >
                Hreinsa leit
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
