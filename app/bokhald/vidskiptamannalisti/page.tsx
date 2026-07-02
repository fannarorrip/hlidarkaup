import { getCustomers, getSuppliers } from "@/lib/accounting-queries";
import VidskiptamannalistiTabs from "./VidskiptamannalistiTabs";

export const dynamic = "force-dynamic";

export default async function VidskiptamannalistiPage() {
  const [customers, suppliers] = await Promise.all([getCustomers(), getSuppliers()]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Viðskiptamannalisti</h1>
      <p className="text-sm text-gray-500 mb-6">Viðskiptamenn (skuldunautar) og lánadrottnar</p>
      <VidskiptamannalistiTabs customers={customers} suppliers={suppliers} />
    </div>
  );
}
