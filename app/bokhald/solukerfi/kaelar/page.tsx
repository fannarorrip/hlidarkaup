import { listUnitsWithToday, history } from "@/lib/kaelar";
import Kaelar from "./Kaelar";

export const dynamic = "force-dynamic";

export default async function KaelarPage() {
  const [units, hist] = await Promise.all([
    listUnitsWithToday().catch(() => []),
    history(14).catch(() => []),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">🌡️ Kælaaflestur</h1>
      <p className="text-sm text-gray-500 mb-6">
        Daglegur hitastigsaflestur kæla og frysta (HACCP — heilbrigðiseftirlitið krefst skráningar). Rautt = utan marka.
      </p>
      <Kaelar initialUnits={units} initialHistory={hist} />
    </div>
  );
}
