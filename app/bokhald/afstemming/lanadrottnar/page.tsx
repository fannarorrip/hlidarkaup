import Link from "next/link";
import LanadrottnaReconcile from "./LanadrottnaReconcile";

export const dynamic = "force-dynamic";

export default function LanadrottnaAfstemmingPage() {
  return (
    <div>
      <Link href="/bokhald/afstemming" className="text-sm text-gray-500 hover:underline">← Afstemming</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1 flex items-center gap-2">🤝 Lánadrottnaafstemming</h1>
      <p className="text-sm text-gray-500 mb-6">Hlaða inn afstemmingalista frá birgi — kerfið les hann og ber saman við bókaða reikninga þess birgis (parað á kennitölu).</p>
      <LanadrottnaReconcile />
    </div>
  );
}
