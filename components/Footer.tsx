import Link from "next/link";
import Logo from "@/components/Logo";
import { MapPinIcon, PhoneIcon, ClockIcon, EnvelopeIcon } from "@heroicons/react/24/outline";

export default function Footer() {
  return (
    <footer className="bg-brand-red text-white mt-16">
      <div className="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 sm:grid-cols-4 gap-8">

        {/* Logo & tagline */}
        <div className="flex flex-col gap-3">
          <Link href="/">
            <Logo height={120} inverted className="-ml-3" />
          </Link>
          <p className="text-red-200 text-sm leading-relaxed">
            Nærverslun þín í hverfinu. Pantaðu á netinu og sæktu þegar þér hentar.
          </p>
        </div>

        {/* Store info */}
        <div>
          <h3 className="font-bold text-base mb-3 uppercase tracking-wide">Verslunarupplýsingar</h3>
          <ul className="space-y-2 text-sm text-red-100">
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
          <h3 className="font-bold text-base mb-3 uppercase tracking-wide">Opnunartímar</h3>
          <ul className="space-y-1.5 text-sm text-red-100">
            <li className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4 flex-shrink-0" />
              <span>Mán–Lau: 09:00–22:00</span>
            </li>
            <li className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4 flex-shrink-0 opacity-0" />
              <span>Sun: 10:00–22:00</span>
            </li>
          </ul>
          <p className="mt-4 text-xs text-red-200">Netpantanir eru tilbúnar til sótt á völdum tíma.</p>
        </div>

        {/* Vending machine */}
        <div>
          <h3 className="font-bold text-base mb-3 uppercase tracking-wide">Sjálfsali — 24/7</h3>
          <p className="text-red-200 text-sm mb-4">Verslaðu hvenær sem er, dag sem nótt.</p>
          <Link
            href="/sjalfsali"
            className="inline-block bg-white text-brand-red font-bold px-4 py-2 rounded-lg text-sm hover:bg-red-50 transition-colors"
          >
            Vantar þig aðgang að sjálfsalanum? →
          </Link>
        </div>

      </div>

      {/* Bottom bar */}
      <div className="border-t border-red-700">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-red-300">
          <span>© {new Date().getFullYear()} Hlíðarkaup. Öll réttindi áskilin.</span>
          <span>Þróað með ❤️ á Íslandi</span>
        </div>
      </div>
    </footer>
  );
}
