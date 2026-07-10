import { listWriteOffs, supplierCreditSummary } from "@/lib/afskriftir";
import Afskriftir from "./Afskriftir";

export const dynamic = "force-dynamic";

export default async function AfskriftirPage() {
  const [rows, summary] = await Promise.all([
    listWriteOffs(30).catch(() => []),
    supplierCreditSummary().catch(() => []),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">🗑️ Afskriftir</h1>
      <p className="text-sm text-gray-500 mb-6">
        Skannaðu vöru sem er hent (útrunnið/skemmt) — birgðir lækka sjálfkrafa og varan fer á kreditlista birgjans.
      </p>
      <Afskriftir initialRows={rows} initialSummary={summary} />
    </div>
  );
}
