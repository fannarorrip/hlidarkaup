import AdsManager from "./AdsManager";

export const dynamic = "force-dynamic";

export default function SkjaauglysingarPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Skjáauglýsingar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Myndir (tilboð, kynningar) sem rúlla á verðskannanum þegar hann er ekki í notkun.
        Skjárinn er 8&quot; í hlutfallinu 4:3 — myndir í 1024×768 (eða sama hlutfalli) koma best út;
        annað snið er skorið til að fylla skjáinn.
      </p>
      <AdsManager />
    </div>
  );
}
