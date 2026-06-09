"use client";

import { useState } from "react";
import Link from "next/link";

export default function SjalfsaliPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !phone || !age) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSent(true);
    }, 800);
  }

  if (sent) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="text-4xl">✅</span>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Takk fyrir umsóknina!</h1>
        <p className="text-gray-500 mb-8">Við munum hafa samband við þig eins fljótt og auðið er.</p>
        <Link href="/" className="inline-block bg-brand-red hover:bg-brand-red-dark text-white font-bold px-8 py-3 rounded-xl transition-colors">
          Fara á forsíðu
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-red to-brand-red-light rounded-2xl px-6 py-8 text-white mb-8 text-center">
        <p className="text-4xl mb-3">🏪</p>
        <h1 className="text-2xl font-extrabold mb-1">Sjálfsali — 24/7</h1>
        <p className="text-red-100 text-sm">Fylltu út formið hér að neðan til að fá aðgang að sjálfsalanum okkar.</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nafn *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Fullt nafn"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Símanúmer *</label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            placeholder="555-1234"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Aldur *</label>
          <input
            type="number"
            value={age}
            onChange={e => setAge(e.target.value)}
            required
            min={1}
            placeholder="25"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand-red hover:bg-brand-red-dark disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {loading ? "Sendi..." : "Senda umsókn"}
        </button>
      </form>
    </div>
  );
}
