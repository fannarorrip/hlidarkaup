"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Þú hættir við staðfestinguna. Reyndu aftur.",
  invalid_state: "Öryggisvillar kom upp. Reyndu aftur.",
  token_failed: "Gat ekki tengt við Kenni. Reyndu aftur.",
  no_kennitala: "Kennitala fékkst ekki frá Kenni. Reyndu aftur.",
  too_young: "Því miður ert þú of ung/ur til að fá aðgang að sjálfsalanum.",
};

function SjalfsaliContent() {
  const params = useSearchParams();
  const errorKey = params.get("error");
  const detail = params.get("detail");
  const errorMsg = errorKey ? (ERROR_MESSAGES[errorKey] ?? "Villa kom upp. Reyndu aftur.") : null;
  const fullError = errorMsg && detail ? `${errorMsg} (${detail})` : errorMsg;

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-red to-brand-red-dark rounded-3xl px-6 py-10 text-white mb-8 text-center">
        <div className="text-5xl mb-4">🏪</div>
        <h1 className="text-2xl font-extrabold mb-2">Sjálfsali — 24/7</h1>
        <p className="text-red-100 text-sm leading-relaxed">
          Fáðu aðgang að sjálfsalanum okkar og verslaðu hvenær sem er, dag sem nótt. Skráning tekur um 2 mínútur.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6 space-y-4">
        <h2 className="font-bold text-gray-900">Hvernig virkar þetta?</h2>
        <div className="space-y-3">
          {[
            { icon: "🪪", text: "Staðfestu þig með rafrænum skilríkjum í gegnum Kenni" },
            { icon: "🤳", text: "Taktu mynd af andliti þínu — hún er notuð til að þekkja þig við dyrnar" },
            { icon: "✅", text: "Þú getur strax farið í sjálfsalann og notað andlitsgreininguna til að opna" },
          ].map(({ icon, text }, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-xl shrink-0 mt-0.5">{icon}</span>
              <p className="text-sm text-gray-600">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Error */}
      {fullError && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">
          {fullError}
        </div>
      )}

      {/* CTA */}
      <Link
        href="/api/auth/kenni"
        className="block w-full bg-brand-red hover:bg-brand-red-dark text-white font-bold py-4 rounded-xl transition-colors text-center text-lg mb-3"
      >
        Skrá mig með rafrænum skilríkjum →
      </Link>

      <p className="text-center text-xs text-gray-400 leading-relaxed">
        Við notum <strong>Kenni</strong> til að staðfesta aldur og auðkenni. Persónuupplýsingar eru eingöngu notaðar til aðgangsstjórnunar.
        Aðgangur er eingöngu veittur einstaklingum 18 ára og eldri.
      </p>
    </div>
  );
}

export default function SjalfsaliPage() {
  return (
    <Suspense>
      <SjalfsaliContent />
    </Suspense>
  );
}
