import Link from "next/link";
import { getStaffSession } from "@/lib/staff-auth-server";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import LogoutButton from "@/app/bokhald/LogoutButton";

const AREAS: { href: string; label: string; desc: string; icon: string; roles: Role[] }[] = [
  { href: "/bokhald", label: "Bókhald", desc: "Fjárhagur, sala, vörur, VSK", icon: "📚", roles: ["stjornandi", "bokari"] },
  { href: "/kassi/starf", label: "Afgreiðslukassi", desc: "Sala — kort og á reikning", icon: "🛒", roles: ["stjornandi", "afgreidsla"] },
  { href: "/admin/sjalfsali", label: "Sjálfsali", desc: "Umsóknir um aðgang", icon: "🚪", roles: ["stjornandi", "afgreidsla", "eldhus"] },
  { href: "/eldhus/admin", label: "Eldhús — SVO GOTT", desc: "Matseðill og pantanir", icon: "🍲", roles: ["stjornandi", "eldhus"] },
  { href: "/bokhald/starfsmenn", label: "Starfsmenn", desc: "Notendur og hlutverk", icon: "👥", roles: ["stjornandi"] },
];

export const dynamic = "force-dynamic";

export default async function StarfHome() {
  const s = await getStaffSession();
  const role = (s?.role ?? "") as Role;
  const areas = AREAS.filter((a) => a.roles.includes(role));
  const initial = (s?.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-screen bg-[#FFF6F6] text-[#21323A]">
      {/* Header band */}
      <header className="bg-[#2C687B]">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between gap-4">
          <p className="text-white font-extrabold text-xl tracking-tight">
            Hlíðarkaup<span className="text-[#DB1A1A]">.</span>
            <span className="ml-2 text-[11px] font-semibold uppercase tracking-wider text-[#8CC7C4] align-middle">Starfsmannakerfi</span>
          </p>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-2 text-xs text-[#E4F1F0]">
              <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center font-bold text-white">{initial}</span>
              {s?.email} · {ROLE_LABEL[role] ?? "—"}
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <h1 className="text-2xl font-bold mb-1">Góðan daginn 👋</h1>
        <p className="text-sm text-[#5C6B72] mb-8">Veldu kerfi — þú sérð það sem hlutverkið þitt ({ROLE_LABEL[role] ?? "—"}) hefur aðgang að.</p>

        {areas.length === 0 ? (
          <p className="text-[#5C6B72]">Ekkert aðgengilegt fyrir þitt hlutverk. Hafðu samband við stjórnanda.</p>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {areas.map((a) => (
              <Link key={a.href} href={a.href}
                className="group flex items-start gap-4 bg-white border border-[#E4F1F0] rounded-2xl p-5 transition-all hover:border-[#8CC7C4] hover:shadow-lg hover:shadow-[#2C687B]/5">
                <span className="w-11 h-11 rounded-xl bg-[#E4F1F0] flex items-center justify-center text-xl shrink-0 transition-colors group-hover:bg-[#2C687B]">
                  <span className="transition-transform group-hover:scale-110">{a.icon}</span>
                </span>
                <span>
                  <span className="block font-bold text-[#21323A] group-hover:text-[#2C687B] transition-colors">{a.label}</span>
                  <span className="block text-sm text-[#5C6B72] mt-0.5">{a.desc}</span>
                </span>
                <span className="ml-auto self-center text-[#8CC7C4] transition-transform group-hover:translate-x-1">→</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
