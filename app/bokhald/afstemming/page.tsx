import Link from "next/link";

export const dynamic = "force-dynamic";

const TYPES = [
  { href: "/bokhald/afstemming/banki", icon: "🏦", title: "Bankaafstemming",
    desc: "Berðu bókhaldslykilinn saman við bankayfirlitið — finndu mismun og staðfestu að allar færslur séu bókaðar. Algengasta afstemmingin.", tag: "Algengast" },
  { href: "/bokhald/afstemming/reikningar", icon: "📋", title: "Reikningsafstemming",
    desc: "Berðu útgefna reikninga saman við greiðslur — sjáðu hvað er ógreitt og hvort eitthvað er tvískráð." },
  { href: "/bokhald/afstemming/birgdir", icon: "📦", title: "Birgðaafstemming",
    desc: "Berðu skráð birgðamagn saman við talningu — leiðréttu mismun á lager." },
  { href: "/bokhald/afstemming/lanadrottnar", icon: "🤝", title: "Lánadrottnaafstemming",
    desc: "Hlaða inn afstemmingalista frá birgi — kerfið les hann og ber saman við bókaða reikninga þess birgis. Finnur reikninga sem vantar eða stemma ekki." },
];

export default function AfstemmingHub() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">📊 Afstemming</h1>
      <p className="text-sm text-gray-500 mb-6">Berðu saman og staðfestu að skrár og reikningar stemmi.</p>

      <div className="grid gap-4 md:grid-cols-3">
        {TYPES.map((t) => (
          <Link key={t.href} href={t.href}
            className="block bg-white border border-gray-200 rounded-xl p-5 hover:border-red-300 hover:shadow-sm transition">
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xl">{t.icon}</span>
              {t.tag && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">{t.tag}</span>}
            </div>
            <p className="font-semibold mb-1">{t.title}</p>
            <p className="text-sm text-gray-500 leading-relaxed">{t.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
