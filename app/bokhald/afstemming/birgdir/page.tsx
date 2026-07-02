import { getStockProducts } from "@/lib/accounting-queries";
import InventoryCount from "./InventoryCount";

export const dynamic = "force-dynamic";

export default async function BirgdaafstemmingPage() {
  const products = await getStockProducts();
  return <InventoryCount products={products} />;
}
