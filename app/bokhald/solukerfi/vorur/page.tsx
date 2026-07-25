import Link from "next/link";
import { getProducts, getProductCount } from "@/lib/accounting-queries";
import ProductsTable from "./ProductsTable";

export const dynamic = "force-dynamic";

export default async function VorurPage() {
  const [products, total] = await Promise.all([getProducts(500), getProductCount()]);
  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">Vörur</h1>
          <p className="text-sm text-gray-500">Vörulisti úr Postgres</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href="/bokhald/solukerfi/vorur/ny"
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
            + Ný vara
          </Link>
          <Link href="/bokhald/solukerfi/vorur/innflutningur"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">
            Flytja inn vörugögn
          </Link>
        </div>
      </div>
      <ProductsTable products={products} total={total} />
    </div>
  );
}
