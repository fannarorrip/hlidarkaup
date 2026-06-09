"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { MapPinIcon, PhoneIcon, ClockIcon, EnvelopeIcon } from "@heroicons/react/24/outline";

function VendingForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !phone || !age) return;
    setLoading(true);
    // Simulate submission (can connect to email/API later)
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 800);
  }

  if (sent) {
    return (
      <div className="bg-white/10 rounded-xl p-5 text-center">
        <p className="text-2xl mb-2">✅</p>
        <p className="font-bold text-white text-base">Takk fyrir umsóknina!</p>
        <p className="text-red-200 text-sm mt-1">Við munum hafa samband við þig eins fljótt og auðið er.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        placeholder="Nafn *"
        value={name}
        onChange={e => setName(e.target.value)}
        required
        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
      />
      <input
        type="tel"
        placeholder="Símanúmer *"
        value={phone}
        onChange={e => setPhone(e.target.value)}
        required
        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
      />
      <input
        type="number"
        placeholder="Aldur *"
        value={age}
        onChange={e => setAge(e.target.value)}
        min={18}
        required
        className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 bg-white/90 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-white"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-white text-brand-red font-bold py-2 rounded-lg text-sm hover:bg-red-50 transition-colors disabled:opacity-60"
      >
        {loading ? "Sendi..." : "Senda umsókn"}
      </button>
    </form>
  );
}

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

        {/* Vending machine form */}
        <div>
          <h3 className="font-bold text-base mb-1 uppercase tracking-wide">Sjálfsali — 24/7</h3>
          <p className="text-red-200 text-xs mb-3">Vantar þig aðgang að sjálfsalanum?</p>
          <VendingForm />
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
