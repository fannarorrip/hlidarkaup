import { getAllOrders } from "@/lib/order-store";
import PantanirList, { type PantunView, type StatusOpt } from "../PantanirList";

export const dynamic = "force-dynamic";

const STATUSES: StatusOpt[] = [
  { key: "pending", label: "Í bið", cls: "bg-amber-100 text-amber-800" },
  { key: "confirmed", label: "Staðfest", cls: "bg-[#E4F1F0] text-[#2C687B]" },
  { key: "ready", label: "Tilbúið", cls: "bg-[#2C687B] text-white" },
  { key: "delivered", label: "Afhent", cls: "bg-gray-100 text-gray-500" },
  { key: "cancelled", label: "Afturkallað", cls: "bg-red-100 text-[#DB1A1A]" },
];

function dt(iso: string) {
  const d = new Date(iso); // Iceland is UTC year-round, so server time == local
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function VefverslunPantanirPage() {
  const orders = await getAllOrders();
  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const views: PantunView[] = orders.map((o) => ({
    id: o.id,
    createdAtLabel: dt(o.createdAt),
    ref: o.id,
    customerName: o.customerName || "—",
    customerPhone: o.customerPhone || null,
    fulfilment: o.deliveryType === "delivery" ? `🚚 Heimsending${o.deliveryAddress ? ` — ${o.deliveryAddress}` : ""}` : "🏪 Sækir sjálfur",
    when: o.pickupTime || "",
    total: o.total,
    lineItems: [
      ...o.items.map((it) => ({ label: it.name, qty: it.quantity, amount: it.price * it.quantity })),
      ...(o.shippingCost > 0 ? [{ label: "Sendingarkostnaður", amount: o.shippingCost }] : []),
    ],
    status: o.status,
    badges: o.reglaError ? ["Ekki bókað"] : [],
    extra: o.deliveryAddress ? [{ label: "Heimilisfang", value: o.deliveryAddress }] : [],
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 text-[#2C687B]">Pantanir — Vefverslun</h1>
      <p className="text-sm text-[#5C6B72] mb-6">Netpantanir úr Hlíðarkaup vefverslun (greitt með korti við afhendingu).</p>
      <PantanirList orders={views} statuses={STATUSES} channel="vefverslun" />
    </div>
  );
}
