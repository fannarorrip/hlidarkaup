import Link from "next/link";
import Logo from "@/components/Logo";
import { MapPinIcon, PhoneIcon, ClockIcon, EnvelopeIcon } from "@heroicons/react/24/outline";

// Djúpur blek-fótur (ritstjórnarlega hreyfingin) — serif-fyrirsagnir, hvítt logo á dökku.
export default function Footer() {
  return (
    <footer className="bg-brand-ink text-white mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-4 gap-8">

        {/* Logo & tagline */}
        <div className="flex flex-col gap-3">
          <Link href="/">
            <Logo height={100} inverted className="-ml-3" />
          </Link>
          <p className="text-white/60 text-sm leading-relaxed">
            Nærverslun þín á Króknum. Pantaðu á netinu og sæktu þegar þér hentar.
          </p>
        </div>

        {/* Store info */}
        <div>
          <h3 className="font-serif font-semibold text-base mb-3 text-brand-teal">Verslunin</h3>
          <ul className="space-y-2 text-sm text-white/75">
            <li className="flex items-start gap-2">
              <MapPinIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Akurhlíð 1, Sauðárkrókur</span>
            </li>
            <li className="flex items-center gap-2">
              <PhoneIcon className="w-4 h-4 flex-shrink-0" />
              <a href="tel:+3544536166" className="hover:text-white transition-colors">453-6166</a>
            </li>
            <li className="flex items-center gap-2">
              <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
              <a href="mailto:hlidarkaup@hlidarkaup.is" className="hover:text-white transition-colors">
                hlidarkaup@hlidarkaup.is
              </a>
            </li>
          </ul>
        </div>

        {/* Opening hours */}
        <div>
          <h3 className="font-serif font-semibold text-base mb-3 text-brand-teal">Opnunartímar</h3>
          <ul className="space-y-1.5 text-sm text-white/75">
            <li className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4 flex-shrink-0" />
              <span>Mán–Lau: 09:00–22:00</span>
            </li>
            <li className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4 flex-shrink-0 opacity-0" />
              <span>Sun: 10:00–22:00</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-white/50">Netpantanir eru tilbúnar til sótt á völdum tíma.</p>
        </div>

        {/* Vending machine */}
        <div>
          <h3 className="font-serif font-semibold text-base mb-3 text-brand-teal">Sjálfsali — 24/7</h3>
          <p className="text-white/60 text-sm mb-4">Verslaðu hvenær sem er, dag sem nótt.</p>
          <Link
            href="/sjalfsali"
            className="inline-block border border-white/40 text-white font-semibold px-4 py-2 rounded-md text-sm hover:bg-white hover:text-brand-ink transition-colors"
          >
            Aðgangur að sjálfsalanum →
          </Link>
        </div>

      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-white/40">
          <span>© {new Date().getFullYear()} Hlíðarkaup. Öll réttindi áskilin.</span>
          <span>Þróað með ❤️ á Íslandi</span>
        </div>
      </div>
    </footer>
  );
}
