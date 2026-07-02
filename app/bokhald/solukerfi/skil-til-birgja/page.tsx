import { listSupplierReturns } from "@/lib/supplier-returns";
import { getSuppliers } from "@/lib/accounting-queries";
import SupplierReturns from "./SupplierReturns";

export const dynamic = "force-dynamic";

export default async function SkilTilBirgjaPage() {
  const [returns, suppliers] = await Promise.all([listSupplierReturns(100), getSuppliers()]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Skil til birgja</h1>
      <p className="text-sm text-gray-500 mb-6">Skilaðu vörum til birgja — lækkar skuld (Lánadrottnar 9300), bakfærir vörukaup + innskatt og lækkar lager. Skilanótu má senda birgjanum.</p>
      <SupplierReturns returns={returns} suppliers={suppliers.filter((s) => !s.is_generic).map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
