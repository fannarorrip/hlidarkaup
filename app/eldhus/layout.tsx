import type { ReactNode } from "react";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { C } from "./theme";
import { Wordmark } from "./Brand";
import { BoxProvider } from "./box-context";
import BoxBar from "./BoxBar";

const serif = Fraunces({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-eldhus-serif" });

export const metadata = {
  title: "SVO GOTT — ferskt hráefni heim að dyrum",
  description: "Veldu uppskriftir vikunnar, við sendum nákvæmlega rétt hráefni og þú eldar ljúffenga máltíð á innan við 40 mínútum. Svo gott, svo létt, svo rétt — frá Hlíðarkaup.",
};

const NAV = [
  { href: "/eldhus/matsedill", label: "Matseðill" },
  { href: "/eldhus#hvernig", label: "Hvernig virkar þetta" },
  { href: "/eldhus#askrift", label: "Áskrift" },
];

export default function EldhusLayout({ children }: { children: ReactNode }) {
  return (
    <div className={serif.variable} style={{ backgroundColor: C.cream, color: C.ink, minHeight: "100vh" }}>
      <BoxProvider>
      <header className="sticky top-0 z-40 backdrop-blur" style={{ backgroundColor: "rgba(255,246,246,0.85)", borderBottom: `1px solid ${C.tealSoft}` }}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/eldhus" className="flex items-center">
            <Wordmark slang />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium" style={{ color: C.muted }}>
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="hover:opacity-70 transition-opacity">{n.label}</Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/eldhus/innskra" className="hidden sm:block text-sm font-semibold hover:opacity-70" style={{ color: C.deep }}>
              Innskrá
            </Link>
            <Link
              href="/eldhus/matsedill"
              className="text-sm font-bold px-5 py-2.5 rounded-full transition-transform active:scale-95"
              style={{ backgroundColor: C.red, color: "#fff" }}
            >
              Panta núna
            </Link>
          </div>
        </div>
      </header>

      {children}

      <footer style={{ backgroundColor: C.deep, color: "#fff" }}>
        <div className="max-w-6xl mx-auto px-6 py-14 grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="mb-3"><Wordmark size="lg" onDark slang /></div>
            <p className="max-w-sm text-sm leading-relaxed" style={{ color: C.teal }}>
              Ferskt hráefni og hugsaðar uppskriftir, sendar heim að dyrum eða tilbúnar til afhendingar í Hlíðarkaup.
            </p>
          </div>
          <div>
            <p className="font-semibold mb-3">Eldhúsið</p>
            <ul className="space-y-2 text-sm" style={{ color: C.teal }}>
              <li><Link href="/eldhus/matsedill" className="hover:opacity-80">Matseðill vikunnar</Link></li>
              <li><Link href="/eldhus#hvernig" className="hover:opacity-80">Hvernig virkar þetta</Link></li>
              <li><Link href="/eldhus#askrift" className="hover:opacity-80">Áskrift</Link></li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-3">Hlíðarkaup</p>
            <ul className="space-y-2 text-sm" style={{ color: C.teal }}>
              <li><Link href="/" className="hover:opacity-80">Vefverslun</Link></li>
              <li>Akurhlíð 1, Sauðárkrókur</li>
              <li>455-4500</li>
            </ul>
          </div>
        </div>
        <div className="text-center text-xs py-5" style={{ color: C.teal, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
          © {new Date().getFullYear()} Hlíðarkaup
        </div>
      </footer>
      <BoxBar />
      </BoxProvider>
    </div>
  );
}
