import { listPurchaseOrders, lowStockProducts } from "@/lib/purchase-orders";
import { getSuppliers } from "@/lib/accounting-queries";
import PurchaseOrders from "./PurchaseOrders";

export const dynamic = "force-dynamic";

export default async function InnkaupapantanirPage() {
  const [orders, lowStock, suppliers] = await Promise.all([listPurchaseOrders(100), lowStockProducts(), getSuppliers()]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Innkaupapantanir</h1>
      <p className="text-sm text-gray-500 mb-6">Búðu til pantanir til birgja og fylgstu með öryggisbirgðum. Pöntun berst í Móttöku þegar varan kemur.</p>
      <PurchaseOrders orders={orders} lowStock={lowStock} suppliers={suppliers.filter((s) => !s.is_generic).map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
