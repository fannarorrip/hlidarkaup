import Link from "next/link";
import CustomerForm from "../CustomerForm";

export const dynamic = "force-dynamic";

export default function NyrVidskiptamadurPage() {
  return (
    <div>
      <Link href="/bokhald/solukerfi/vidskiptamenn" className="text-sm text-gray-500 hover:underline">← Viðskiptamenn</Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">Nýr viðskiptamaður</h1>
      <CustomerForm />
    </div>
  );
}
