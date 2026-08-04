import Link from "next/link";
import { getCustomers } from "@/lib/accounting-queries";
import CustomerTable from "./CustomerTable";

export const dynamic = "force-dynamic";

export default async function VidskiptamennPage() {
  const customers = await getCustomers();
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Viðskiptamenn</h1>
          <p className="text-sm text-gray-500">{customers.length} viðskiptamenn</p>
        </div>
        <Link href="/bokhald/solukerfi/vidskiptamenn/nyr" className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">+ Nýr viðskiptamaður</Link>
      </div>
      <CustomerTable customers={customers} />
    </div>
  );
}
