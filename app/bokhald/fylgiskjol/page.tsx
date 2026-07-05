import { getVoucherList } from "@/lib/accounting-queries";
import VouchersTable from "./VouchersTable";

export const dynamic = "force-dynamic";

export default async function FylgiskjolPage() {
  const vouchers = await getVoucherList(200);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Fylgiskjöl</h1>
      <p className="text-sm text-gray-500 mb-6">Dagbók — allar bókaðar færslur</p>
      <VouchersTable vouchers={vouchers} />
    </div>
  );
}
