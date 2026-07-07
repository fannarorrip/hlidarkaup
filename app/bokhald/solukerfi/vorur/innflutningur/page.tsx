import Link from "next/link";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="max-w-5xl">
      <Link href="/bokhald/solukerfi/vorur" className="text-sm text-gray-500 hover:underline">← Vörur</Link>
      <h1 className="text-2xl font-bold mt-2 mb-1">Flytja inn vörugögn frá birgja</h1>
      <p className="text-sm text-gray-500 mb-6">
        Sæktu Excel- eða CSV-skrá frá birgja. Gervigreindin kortleggur dálkana sjálf, parar línur við vörurnar
        okkar eftir strikamerki og sýnir forskoðun áður en nokkuð er vistað. Aðeins innihald, ofnæmisvaldar,
        næringargildi, nettómagn og uppruni eru uppfærð — verð og birgðir eru aldrei snert.
      </p>
      <ImportClient />
    </div>
  );
}
