import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/accounting-queries";
import CustomerForm from "../CustomerForm";

export const dynamic = "force-dynamic";

export default async function CustomerEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCustomer(id);
  if (!c) notFound();
  return (
    <div>
      <Link href="/bokhald/solukerfi/vidskiptamenn" className="text-sm text-gray-500 hover:underline">← Viðskiptamenn</Link>
      <h1 className="text-2xl font-bold mt-2 mb-6">{c.name}</h1>
      <CustomerForm customer={c} />
    </div>
  );
}
