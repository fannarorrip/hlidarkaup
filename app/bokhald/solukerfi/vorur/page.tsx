import { getProducts, getProductCount } from "@/lib/accounting-queries";
import ProductsTable from "./ProductsTable";

export const dynamic = "force-dynamic";

export default async function VorurPage() {
  const [products, total] = await Promise.all([getProducts(500), getProductCount()]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Vörur</h1>
      <p className="text-sm text-gray-500 mb-6">Vörulisti úr Postgres</p>
      <ProductsTable products={products} total={total} />
    </div>
  );
}
