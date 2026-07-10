import { listPurchaseOrders, lowStockProducts } from "@/lib/purchase-orders";
import { getSuppliers } from "@/lib/accounting-queries";
import { getOrderSchedule, listOrderTemplates } from "@/lib/heartbeat";
import PurchaseOrders from "./PurchaseOrders";
import Heartbeat from "./Heartbeat";

export const dynamic = "force-dynamic";

export default async function InnkaupapantanirPage() {
  const [orders, lowStock, suppliers, schedule, templates] = await Promise.all([
    listPurchaseOrders(100), lowStockProducts(), getSuppliers(),
    getOrderSchedule().catch(() => []), listOrderTemplates().catch(() => []),
  ]);
  // JS getDay(): 0=sunnudagur … 6=laugardagur → 1=mánudagur … 7=sunnudagur
  const todayWeekday = ((new Date().getDay() + 6) % 7) + 1;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Innkaupapantanir</h1>
      <p className="text-sm text-gray-500 mb-6">Búðu til pantanir til birgja og fylgstu með öryggisbirgðum. Pöntun berst í Móttöku þegar varan kemur.</p>
      <Heartbeat schedule={schedule} templates={templates} todayWeekday={todayWeekday} />
      <PurchaseOrders orders={orders} lowStock={lowStock} suppliers={suppliers.filter((s) => !s.is_generic).map((s) => ({ id: s.id, name: s.name }))} />
    </div>
  );
}
