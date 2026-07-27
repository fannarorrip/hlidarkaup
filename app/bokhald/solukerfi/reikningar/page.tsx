import Link from "next/link";
import { getSalesInvoices } from "@/lib/accounting-queries";
import ReikningarTable from "./ReikningarTable";

export const dynamic = "force-dynamic";

export default async function ReikningarPage() {
  const rows = await getSalesInvoices(200);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">Reikningar</h1>
        <Link href="/bokhald/solukerfi/reikningar/nyr" className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">+ Búa til reikning</Link>
      </div>
      <p className="text-sm text-gray-500 mb-6">Öll sala — kassasala og reikningar</p>
      <ReikningarTable rows={rows} />
    </div>
  );
}
