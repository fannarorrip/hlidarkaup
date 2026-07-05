import AdsManager from "./AdsManager";

export const dynamic = "force-dynamic";

export default function SkjaauglysingarPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Skjáauglýsingar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Myndir (tilboð, kynningar) sem rúlla á verðskannanum þegar hann er ekki í notkun.
        Skjárinn er 8&quot; — myndir í landslagssniði (t.d. 1280×800) koma best út.
      </p>
      <AdsManager />
    </div>
  );
}
