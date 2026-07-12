"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type LinkItem = { href: string; label: string; soon?: boolean; badgeKey?: "pendingEmail" };
const SECTIONS: { title: string; links: LinkItem[] }[] = [
  {
    title: "Bókhald",
    links: [
      { href: "/bokhald", label: "Yfirlit" },
      { href: "/bokhald/dagatal", label: "Dagatal" },
      { href: "/bokhald/lyklar", label: "Bókhaldslyklar" },
      { href: "/bokhald/fylgiskjol", label: "Fylgiskjöl" },
      { href: "/bokhald/skraning", label: "Skráning" },
      { href: "/bokhald/skraning/postholf", label: "Pósthólf", badgeKey: "pendingEmail" },
      { href: "/bokhald/adalbok", label: "Aðalbók" },
      { href: "/bokhald/hreyfingar", label: "Hreyfingar" },
      { href: "/bokhald/profjofnudur", label: "Prófjöfnuður" },
      { href: "/bokhald/rekstur", label: "Rekstrarreikningur" },
      { href: "/bokhald/efnahagur", label: "Efnahagsreikningur" },
      { href: "/bokhald/arsreikningur", label: "Ársreikningur" },
      { href: "/bokhald/vsk", label: "VSK uppgjör" },
      { href: "/bokhald/afstemming", label: "Afstemming" },
      { href: "/bokhald/stada-vidskiptamanna", label: "Staða viðskiptamanna" },
      { href: "/bokhald/vidskiptamannalisti", label: "Viðskiptamannalisti" },
      { href: "/bokhald/solukerfi/birgjar", label: "Lánadrottnar" },
    ],
  },
  {
    title: "Sölukerfi",
    links: [
      { href: "/bokhald/solukerfi/pantanir/vefverslun", label: "Pantanir – Vefverslun" },
      { href: "/bokhald/solukerfi/pantanir/eldhus", label: "Pantanir – Eldhús" },
      { href: "/bokhald/solukerfi/reikningar", label: "Reikningar" },
      { href: "/bokhald/solukerfi/vidskiptamenn", label: "Viðskiptamenn" },
      { href: "/bokhald/solukerfi/vorur", label: "Vörur" },
      { href: "/bokhald/solukerfi/voruflokkar", label: "Vöruflokkar" },
      { href: "/bokhald/solukerfi/manaduppgjor", label: "Mánaðaruppgjör" },
      { href: "/bokhald/solukerfi/kassauppgjor", label: "Kassauppgjör" },
      { href: "/bokhald/solukerfi/krofur", label: "Kröfur" },
      { href: "/bokhald/solukerfi/krofustillingar", label: "Kröfustillingar", soon: true },
      { href: "/bokhald/solukerfi/skjaauglysingar", label: "Skjáauglýsingar" },
    ],
  },
  {
    title: "Lagerkerfi",
    links: [
      { href: "/bokhald/solukerfi/innkaup", label: "Innkaup" },
      { href: "/bokhald/solukerfi/innkaupapantanir", label: "Innkaupapantanir" },
      { href: "/bokhald/solukerfi/innkaup/mottaka", label: "Móttaka" },
      { href: "/bokhald/solukerfi/skil-til-birgja", label: "Skil til birgja" },
      { href: "/bokhald/solukerfi/afskriftir", label: "Afskriftir" },
      { href: "/bokhald/solukerfi/kaelar", label: "Kælaaflestur" },
      { href: "/bokhald/solukerfi/birgdaskyrsla", label: "Birgðaskýrsla" },
    ],
  },
  {
    title: "Laun",
    links: [
      { href: "/bokhald/laun", label: "Launakeyrslur" },
      { href: "/bokhald/laun/reiknivel", label: "Launareiknivél" },
      { href: "/bokhald/laun/launthegar", label: "Launþegar" },
      { href: "/bokhald/laun/stettarfelog", label: "Stéttarfélög" },
      { href: "/bokhald/laun/skilagrein", label: "Skilagrein" },
      { href: "/bokhald/laun/launamidar", label: "Launamiðar" },
    ],
  },
];

const Chevron = ({ open }: { open: boolean }) => (
  <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d="M6 8l4 4 4-4" /></svg>
);

export default function BokhaldNav({ role, pendingEmail = 0 }: { role?: string; pendingEmail?: number }) {
  const path = usePathname() ?? "";
  const [open, setOpen] = useState<string | null>(null); // desktop dropdown
  const [mobileOpen, setMobileOpen] = useState(false); // mobile drawer
  const [expanded, setExpanded] = useState<Set<string>>(new Set()); // mobile accordion
  const ref = useRef<HTMLElement>(null);

  const sections = [...SECTIONS];
  if (role === "stjornandi") sections.push({ title: "Stjórnun", links: [
    { href: "/bokhald/starfsmenn", label: "Starfsmenn" },
    { href: "/bokhald/bankatenging", label: "Bankatenging" },
  ] });

  // Highlight only the most specific matching link.
  const activeHref = sections
    .flatMap((s) => s.links.map((l) => l.href))
    .filter((h) => path === h || (h !== "/bokhald" && path.startsWith(h + "/")))
    .sort((a, b) => b.length - a.length)[0] ?? "";
  const activeSectionTitle = sections.find((s) => s.links.some((l) => l.href === activeHref))?.title ?? "";

  // Close on outside click (desktop dropdown) and after navigation (both).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => { setOpen(null); setMobileOpen(false); }, [path]);
  // Open the drawer on the active section; lock body scroll while open.
  useEffect(() => {
    if (mobileOpen) {
      setExpanded(new Set(activeSectionTitle ? [activeSectionTitle] : []));
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [mobileOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleExpand = (t: string) => setExpanded((p) => { const s = new Set(p); s.has(t) ? s.delete(t) : s.add(t); return s; });
  const totalBadge = sections.reduce((n, s) => n + s.links.reduce((m, l) => m + (l.badgeKey === "pendingEmail" ? pendingEmail : 0), 0), 0);

  return (
    <>
      {/* ── Desktop: horizontal dropdown bar (lg+) ── */}
      <nav ref={ref} className="hidden lg:flex items-center gap-0.5">
        {sections.map((sec) => {
          const isOpen = open === sec.title;
          const activeSection = sec.title === activeSectionTitle;
          const secBadge = sec.links.reduce((n, l) => n + (l.badgeKey === "pendingEmail" ? pendingEmail : 0), 0);
          return (
            <div key={sec.title} className="relative" onMouseEnter={() => setOpen((o) => (o ? sec.title : o))}>
              <button
                onClick={() => setOpen(isOpen ? null : sec.title)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors ${
                  isOpen ? "bg-white/15" : activeSection ? "bg-white/10" : "hover:bg-white/10"
                }`}
              >
                <span>{sec.title}</span>
                {secBadge > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[#DB1A1A] text-white text-[10px] font-bold">{secBadge}</span>
                )}
                <Chevron open={isOpen} />
              </button>
              {isOpen && (
                <div className="absolute left-0 top-full pt-2">
                  <div className="min-w-[15rem] rounded-xl bg-white border border-[#E4F1F0] shadow-xl shadow-black/5 p-1.5">
                    {sec.links.map((l) => {
                      const active = l.href === activeHref;
                      const badge = l.badgeKey === "pendingEmail" ? pendingEmail : 0;
                      return (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => setOpen(null)}
                          className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            active ? "bg-[#E4F1F0] text-[#2C687B] font-semibold" : "text-[#21323A] hover:bg-[#E4F1F0]"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            {l.label}
                            {l.soon && <span className="text-[10px] text-[#9DB0B6]">væntanl.</span>}
                          </span>
                          {badge > 0 && (
                            <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#DB1A1A] text-white text-[11px] font-bold">{badge}</span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── Mobile/tablet: hamburger (below lg) ── */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Opna valmynd"
        aria-expanded={mobileOpen}
        className="lg:hidden relative flex items-center justify-center w-10 h-10 rounded-lg text-white hover:bg-white/10 transition-colors"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        {totalBadge > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#DB1A1A] ring-2 ring-[#2C687B]" />}
      </button>

      {/* ── Mobile drawer ── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 top-14 z-40 bg-black/30" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute inset-x-0 top-0 max-h-[calc(100dvh-3.5rem)] overflow-y-auto bg-[#FFF6F6] border-b border-[#E4F1F0] shadow-xl p-3 space-y-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {sections.map((sec) => {
              const isExp = expanded.has(sec.title);
              const secBadge = sec.links.reduce((n, l) => n + (l.badgeKey === "pendingEmail" ? pendingEmail : 0), 0);
              const activeSection = sec.title === activeSectionTitle;
              return (
                <div key={sec.title} className="rounded-xl bg-white border border-[#E4F1F0] overflow-hidden">
                  <button
                    onClick={() => toggleExpand(sec.title)}
                    className={`w-full flex items-center justify-between gap-2 px-4 min-h-[48px] text-left ${activeSection ? "text-[#2C687B]" : "text-[#21323A]"}`}
                  >
                    <span className="flex items-center gap-2 font-semibold">
                      {sec.title}
                      {secBadge > 0 && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#DB1A1A] text-white text-[11px] font-bold">{secBadge}</span>
                      )}
                    </span>
                    <Chevron open={isExp} />
                  </button>
                  {isExp && (
                    <div className="border-t border-[#F0F5F5] p-1.5">
                      {sec.links.map((l) => {
                        const active = l.href === activeHref;
                        const badge = l.badgeKey === "pendingEmail" ? pendingEmail : 0;
                        return (
                          <Link
                            key={l.href}
                            href={l.href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center justify-between gap-3 px-3 min-h-[44px] rounded-lg text-sm transition-colors ${
                              active ? "bg-[#E4F1F0] text-[#2C687B] font-semibold" : "text-[#21323A] hover:bg-[#F0F5F5]"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              {l.label}
                              {l.soon && <span className="text-[10px] text-[#9DB0B6]">væntanl.</span>}
                            </span>
                            {badge > 0 && (
                              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-[#DB1A1A] text-white text-[11px] font-bold">{badge}</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
