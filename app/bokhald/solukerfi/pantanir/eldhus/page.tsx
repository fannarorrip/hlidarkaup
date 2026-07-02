import { getEldhusOrders, eldhusOrdersEnabled } from "@/lib/eldhus-orders";
import PantanirList, { type PantunView, type StatusOpt } from "../PantanirList";

export const dynamic = "force-dynamic";

const STATUSES: StatusOpt[] = [
  { key: "new", label: "Ný", cls: "bg-amber-100 text-amber-800" },
  { key: "preparing", label: "Í vinnslu", cls: "bg-[#E4F1F0] text-[#2C687B]" },
  { key: "done", label: "Tilbúin", cls: "bg-[#2C687B] text-white" },
];

function dt(iso: string) {
  const d = new Date(iso); // Iceland is UTC year-round
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default async function EldhusPantanirPage() {
  const enabled = eldhusOrdersEnabled();
  const orders = enabled ? await getEldhusOrders() : [];

  const views: PantunView[] = orders.map((o) => ({
    id: o.id,
    createdAtLabel: o.created_at ? dt(o.created_at) : "",
    ref: o.ref || o.id.slice(0, 8),
    customerName: o.customer_name || "—",
    customerPhone: o.customer_phone || null,
    fulfilment: o.delivery_type === "delivery" ? `🚚 Heimsending${o.address ? ` — ${o.address}` : ""}` : "🏬 Sókn í verslun",
    when: [o.delivery_date, o.pickup_time].filter(Boolean).join(" "),
    total: Number(o.total ?? 0),
    lineItems: (o.items ?? []).map((it) => ({ label: it.title })),
    status: o.status || "new",
    badges: o.plan === "subscription" ? ["Áskrift"] : [],
    extra: [
      ...(o.meals != null && o.portions != null ? [{ label: "Stærð", value: `${o.meals} réttir × ${o.portions} manna` }] : []),
      ...(o.subtotal != null ? [{ label: "Réttir", value: `${Math.round(Number(o.subtotal)).toLocaleString("is-IS")} kr.` }] : []),
      ...(o.shipping ? [{ label: "Sending", value: `${Math.round(Number(o.shipping)).toLocaleString("is-IS")} kr.` }] : []),
      ...(o.customer_email ? [{ label: "Netfang", value: o.customer_email }] : []),
    ],
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1 text-[#2C687B]">Pantanir — Eldhús</h1>
      <p className="text-sm text-[#5C6B72] mb-6">SVO GOTT pantanir og áskriftir úr eldhúsinu.</p>
      {!enabled ? (
        <div className="bg-white rounded-2xl border border-[#E4F1F0] px-5 py-10 text-center text-[#5C6B72]">
          Supabase er ekki uppsett (<code>SUPABASE_SERVICE_ROLE_KEY</code> vantar) — eldhúspantanir nást ekki.
        </div>
      ) : (
        <PantanirList orders={views} statuses={STATUSES} channel="eldhus" />
      )}
    </div>
  );
}
