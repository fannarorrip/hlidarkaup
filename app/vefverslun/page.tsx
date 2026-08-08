"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import ProductCard from "@/components/ProductCard";
import SearchBar from "@/components/SearchBar";
import { Product } from "@/lib/types";
import { saveSearchHistory } from "@/lib/search-history";

// Vefverslunin — flatt, ritstjórnarlegt útlit á Color Hunt pallettunni (ink/deep/teal/red)
// með Fraunces-serif í fyrirsögnum. Vefflokkarnir (shop.web_categories) eru burðarásinn:
// yfirflokkarnir í flökkurail efst, undirflokkar sem síur, og vörurnar birtast STRAX
// (Postgres — gamla „leitaðu fyrst"-hindrunin var Regla-arfleifð).
const LIMIT = 48;

interface Flokkur { slug: string; name: string; parent: string | null; products: number }

export default function HomePage() {
  const [search, setSearch] = useState("");
  const [flokkur, setFlokkur] = useState("");       // valinn YFIRflokkur (slug)
  const [undir, setUndir] = useState("");           // valinn undirflokkur (slug)
  const [flokkar, setFlokkar] = useState<Flokkur[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const activeSlug = undir || flokkur;

  const fetchProducts = useCallback(async (q: string, slug: string, p: number, replace: boolean) => {
    if (p === 0) setInitialLoading(true); else setLoadingMore(true);
    try {
      const params = new URLSearchParams({ search: q, flokkur: slug, page: String(p), limit: String(LIMIT) });
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts((prev) => (replace ? (data.products ?? []) : [...prev, ...(data.products ?? [])]));
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

  // Flokkatréð einu sinni + vörurnar strax við fyrstu heimsókn.
  useEffect(() => {
    fetch("/api/vefflokkar").then((r) => r.json()).then((d) => setFlokkar(d.flokkar ?? [])).catch(() => {});
    fetchProducts("", "", 0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leit (debounce-uð) og flokkaval sækja nýjan lista.
  useEffect(() => {
    const t = setTimeout(() => { fetchProducts(search, activeSlug, 0, true); }, search.trim() ? 350 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, activeSlug]);

  const mains = useMemo(() => flokkar.filter((f) => !f.parent && f.products > 0), [flokkar]);
  const subs = useMemo(() => flokkar.filter((f) => f.parent === flokkur && f.products > 0), [flokkar, flokkur]);
  const activeName = useMemo(() => flokkar.find((f) => f.slug === activeSlug)?.name ?? "", [flokkar, activeSlug]);

  const pickMain = (slug: string) => { setUndir(""); setFlokkur(slug === flokkur ? "" : slug); };
  const isSearching = search.trim().length >= 2;
  const hasMore = products.length < total;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      {/* Hetja — flöt, ritstjórnarleg: blek á djúpbláum fleti, serif-fyrirsögn, engin gradient */}
      <div className="bg-brand-deep text-white rounded-md px-6 py-8 sm:px-10 sm:py-10">
        <p className="text-[11px] uppercase tracking-[0.2em] text-brand-teal mb-2">Hlíðarkaup · Sauðárkróki</p>
        <h1 className="font-serif text-3xl sm:text-4xl font-semibold leading-tight mb-2">
          Verslaðu heiman frá.
        </h1>
        <p className="text-sm sm:text-base text-white/80 max-w-lg">
          Pantaðu fyrir hádegi — sæktu í Akurhlíð 1 eða fáðu sent heim á Króknum.
          Opið alla daga <span className="text-white font-semibold">09:00–22:00</span>.
        </p>
      </div>

      {/* Leit */}
      <SearchBar value={search} onChange={setSearch} />

      {/* Flokkarail — yfirflokkarnir 18, flatt með undirstriki á virkum */}
      {mains.length > 0 && (
        <nav className="-mx-4 px-4 overflow-x-auto">
          <div className="flex gap-1 border-b border-gray-200 min-w-max">
            <button onClick={() => { setFlokkur(""); setUndir(""); }}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                !flokkur ? "border-brand-red text-brand-ink font-semibold" : "border-transparent text-brand-muted hover:text-brand-ink"}`}>
              Allt
            </button>
            {mains.map((f) => (
              <button key={f.slug} onClick={() => pickMain(f.slug)}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  flokkur === f.slug ? "border-brand-red text-brand-ink font-semibold" : "border-transparent text-brand-muted hover:text-brand-ink"}`}>
                {f.name}
              </button>
            ))}
          </div>
        </nav>
      )}

      {/* Undirflokkar valins yfirflokks */}
      {subs.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setUndir("")}
            className={`px-2.5 py-1 text-xs rounded border transition-colors ${
              !undir ? "border-brand-ink bg-brand-ink text-white" : "border-gray-300 text-brand-muted hover:border-brand-ink hover:text-brand-ink"}`}>
            Allt í {flokkar.find((f) => f.slug === flokkur)?.name}
          </button>
          {subs.map((f) => (
            <button key={f.slug} onClick={() => setUndir(f.slug === undir ? "" : f.slug)}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                undir === f.slug ? "border-brand-ink bg-brand-ink text-white" : "border-gray-300 text-brand-muted hover:border-brand-ink hover:text-brand-ink"}`}>
              {f.name} <span className="opacity-50">{f.products}</span>
            </button>
          ))}
        </div>
      )}

      {/* Flokkaflísar á forsíðustöðu — flatir litafletir, serif-heiti, vörufjöldi */}
      {!flokkur && !isSearching && mains.length > 0 && (
        <section>
          <h2 className="font-serif text-xl font-semibold text-brand-ink mb-3">Vöruflokkarnir</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {mains.map((f, i) => (
              <button key={f.slug} onClick={() => pickMain(f.slug)}
                className={`text-left px-4 py-4 rounded-md border border-transparent hover:border-brand-ink transition-colors ${
                  i % 3 === 0 ? "bg-brand-tealsoft" : i % 3 === 1 ? "bg-brand-cream" : "bg-brand-mist"}`}>
                <span className="font-serif text-base font-semibold text-brand-ink block leading-snug">{f.name}</span>
                <span className="text-xs text-brand-muted">{f.products} vörur</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Vörugrid */}
      <section>
        {!initialLoading && (
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-serif text-xl font-semibold text-brand-ink">
              {isSearching ? `Leit: „${search.trim()}“` : activeName || "Allar vörur"}
            </h2>
            <span className="text-sm text-brand-muted">{total} vörur</span>
          </div>
        )}

        {initialLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="bg-gray-100 rounded-md h-48 animate-pulse" />
            ))}
          </div>
        ) : products.length > 0 ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            {hasMore && (
              <div className="text-center mt-8">
                <button
                  onClick={() => fetchProducts(search, activeSlug, page + 1, false)}
                  disabled={loadingMore}
                  className="border border-brand-ink text-brand-ink font-semibold px-8 py-3 rounded-md hover:bg-brand-ink hover:text-white transition-colors disabled:opacity-60"
                >
                  {loadingMore ? "Hleð…" : `Sýna fleiri (${total - products.length} eftir)`}
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="border border-dashed border-gray-300 rounded-md py-16 text-center">
            <p className="font-serif text-lg text-brand-ink mb-1">
              {isSearching ? "Engin vara fannst" : "Engar vörur í þessum flokki enn"}
            </p>
            <p className="text-sm text-brand-muted">
              {isSearching ? "Prófaðu annað leitarorð — eða kíktu í flokkana." : "Vöruúrvalið á vefnum stækkar jafnt og þétt."}
            </p>
            {(isSearching || activeSlug) && (
              <button onClick={() => { setSearch(""); setFlokkur(""); setUndir(""); }}
                className="mt-4 text-sm text-brand-deep underline underline-offset-4 hover:text-brand-ink">
                Sýna allt
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
