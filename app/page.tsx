import Link from "next/link";
import Logo from "@/components/Logo";
import {
  BuildingStorefrontIcon,
  FireIcon,
  MapPinIcon,
  PhoneIcon,
  ClockIcon,
  EnvelopeIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

export const metadata = {
  title: "Hlíðarkaup — nærverslunin þín",
  description: "Vefverslun og eldhús Hlíðarkaups á Sauðárkróki. Pantaðu á netinu, sæktu þegar þér hentar.",
};

function Choice({
  href,
  title,
  desc,
  cta,
  Icon,
}: {
  href: string;
  title: string;
  desc: string;
  cta: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-xl
                 hover:-translate-y-1 transition-all duration-200 overflow-hidden"
    >
      <div className="flex items-center justify-center h-40 sm:h-48 bg-gradient-to-br from-brand-red to-brand-red-dark">
        <Icon className="w-16 h-16 sm:w-20 sm:h-20 text-white/95" />
      </div>
      <div className="flex flex-col flex-1 p-6 sm:p-7">
        <h2 className="text-2xl font-extrabold text-gray-900">{title}</h2>
        <p className="mt-2 text-gray-600 leading-relaxed flex-1">{desc}</p>
        <span className="mt-5 inline-flex items-center gap-1.5 font-bold text-brand-red group-hover:gap-3 transition-all">
          {cta} <ArrowRightIcon className="w-5 h-5" />
        </span>
      </div>
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Hero */}
      <section className="bg-brand-red text-white">
        <div className="max-w-5xl mx-auto px-6 pt-12 pb-16 sm:pt-16 sm:pb-20 flex flex-col items-center text-center">
          <Logo height={72} inverted />
          <p className="mt-2 text-white/90 text-base sm:text-lg font-medium tracking-wide">— með þér alla daga</p>
          <h1 className="mt-8 text-3xl sm:text-5xl font-extrabold leading-tight">Velkomin í Hlíðarkaup</h1>
          <p className="mt-3 text-red-100 text-base sm:text-xl max-w-xl">
            Nærverslunin þín á Sauðárkróki. Hvert viltu fara?
          </p>
        </div>
      </section>

      {/* Two choices */}
      <section className="max-w-5xl mx-auto w-full px-6 -mt-10 sm:-mt-12 grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-7">
        <Choice
          href="/vefverslun"
          title="Vefverslun"
          desc="Pantaðu matvöru á netinu og sæktu þegar þér hentar — allt úrvalið á einum stað."
          cta="Versla núna"
          Icon={BuildingStorefrontIcon}
        />
        <Choice
          href="/eldhus"
          title="Eldhúsið"
          desc="Ferskir, tilbúnir réttir og heimilismatur beint úr eldhúsinu okkar."
          cta="Skoða matseðil"
          Icon={FireIcon}
        />
      </section>

      {/* Store info */}
      <section className="max-w-5xl mx-auto w-full px-6 mt-14 sm:mt-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 rounded-3xl bg-white border border-gray-100 shadow-sm p-7 sm:p-9">
          <div>
            <h3 className="flex items-center gap-2 font-bold text-gray-900 mb-3">
              <ClockIcon className="w-5 h-5 text-brand-red" /> Opnunartímar
            </h3>
            <ul className="space-y-1 text-gray-600 text-sm">
              <li>Mán–Lau: 09:00–22:00</li>
              <li>Sun: 10:00–22:00</li>
            </ul>
            <p className="mt-3 text-xs text-gray-400">Netpantanir tilbúnar til sótt á völdum tíma.</p>
          </div>
          <div>
            <h3 className="flex items-center gap-2 font-bold text-gray-900 mb-3">
              <MapPinIcon className="w-5 h-5 text-brand-red" /> Hafðu samband
            </h3>
            <ul className="space-y-2 text-gray-600 text-sm">
              <li>Akurhlíð 1, Sauðárkrókur</li>
              <li className="flex items-center gap-1.5">
                <PhoneIcon className="w-4 h-4 text-gray-400" />
                <a href="tel:+3544536166" className="hover:text-brand-red transition-colors">453-6166</a>
              </li>
              <li className="flex items-center gap-1.5">
                <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                <a href="mailto:hlidarkaup@hlidarkaup.is" className="hover:text-brand-red transition-colors">
                  hlidarkaup@hlidarkaup.is
                </a>
              </li>
            </ul>
          </div>
          <div className="flex flex-col">
            <h3 className="font-bold text-gray-900 mb-2">Sjálfsali — 24/7</h3>
            <p className="text-gray-600 text-sm flex-1">Verslaðu hvenær sem er, dag sem nótt.</p>
            <Link
              href="/sjalfsali"
              className="mt-4 inline-flex items-center gap-1.5 self-start bg-brand-red hover:bg-brand-red-dark
                         text-white font-bold px-4 py-2.5 rounded-xl text-sm transition-colors"
            >
              Fá aðgang <ArrowRightIcon className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="mt-auto pt-14 pb-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Hlíðarkaup · Öll réttindi áskilin
      </footer>
    </div>
  );
}
