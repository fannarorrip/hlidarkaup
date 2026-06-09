"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import ProductCard from "@/components/ProductCard";
import SearchBar from "@/components/SearchBar";
import CategoryFilter from "@/components/CategoryFilter";
import { mockProducts, POPULAR_IDS } from "@/lib/mock-products";
import { Product } from "@/lib/types";
import { saveSearchHistory } from "@/lib/search-history";

const LIMIT = 48;

// Local fallback filter (used while Regla loads or on error)
function localFilter(products: Product[], query: string) {
  const q = query.toLowerCase();
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.category ?? "").toLowerCase().includes(q)
  );
}

const popularProducts = POPULAR_IDS
  .map((id) => mockProducts.find((p) => p.id === id))
  .filter(Boolean) as Product[];

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  // Regla products state
  const [products, setProducts]   = useState<Product[]>([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [usingRegla, setUsingRegla] = useState(false);

  // Debounce ref
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Fetch products from Regla API
  const fetchProducts = useCallback(async (q: string, p: number, replace: boolean) => {
    if (p === 0) setInitialLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ search: q, page: String(p), limit: String(LIMIT) });
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();

      if (data.products?.length > 0 || p === 0) {
        setUsingRegla(true);
        setProducts((prev) => replace ? data.products : [...prev, ...data.products]);
        setTotal(data.total ?? 0);
        setPage(p);
        if (q.trim().length >= 2) saveSearchHistory(q.trim());
      }
    } catch {
      // silently fall back to mock data
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchProducts("", 0, true);
  }, [fetchProducts]);

  // Search with debounce
  useEffect(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    const t = setTimeout(() => {
      fetchProducts(search, 0, true);
    }, 400);
    setDebounceTimer(t);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Category change
  useEffect(() => {
    fetchProducts(search, 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  // Categories derived from loaded products
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category).filter(Boolean))] as string[],
    [products]
  );

  // Client-side category filter (Regla doesn't filter by group in SearchProducts easily)
  const filtered = useMemo(() => {
    let base = usingRegla ? products : (
      search.trim().length >= 2 ? localFilter(mockProducts, search) : mockProducts
    );
    if (category) base = base.filter((p) => p.category === category);
    return base;
  }, [products, search, category, usingRegla]);

  const isSearching = search.trim().length >= 2 || category;
  const hasMore = usingRegla && products.length < total && !category;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Hero */}
      <div className="bg-gradient-to-r from-brand-red to-brand-red-light rounded-2xl px-6 py-8 text-white">
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-1">Velkomin í Hlíðarkaup</h1>
        <p className="text-red-100 text-sm sm:text-base">
          Pantaðu og sæktu í verslunina — opið <strong className="text-white">10:00–22:00</strong>
        </p>
      </div>

      {/* Search */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Categories */}
      {categories.length > 0 && (
        <CategoryFilter categories={categories} selected={category} onSelect={setCategory} />
      )}

      {/* Popular products — only when not searching and using mock data */}
      {!isSearching && !usingRegla && !initialLoading && (
        <section>
          <h2 className="text-lg font-bold text-gray-800 mb-3">🔥 Vinsælar vörur</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {popularProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      {/* Product grid */}
      <section>
        {isSearching && !initialLoading && (
          <p className="text-sm text-gray-500 mb-3">
            {filtered.length} vara{filtered.length !== 1 ? "r" : ""} fundust
            {usingRegla && total > filtered.length && ` (${total} í heildina)`}
          </p>
        )}
        {!isSearching && !initialLoading && (
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

            {/* Load more */}
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
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-gray-500 font-medium">Engar vörur fundust</p>
            <button
              onClick={() => { setSearch(""); setCategory(""); }}
              className="mt-3 text-brand-red hover:underline text-sm font-medium"
            >
              Hreinsa leit
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
