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
        <Link href="/bokhald/solukerfi/vorur/innflutningur"
          className="shrink-0 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">
          Flytja inn vörugögn
        </Link>
      </div>
      <ProductsTable products={products} total={total} />
    </div>
  );
}
