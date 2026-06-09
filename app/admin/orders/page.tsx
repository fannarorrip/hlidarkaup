"use client";

import { useEffect, useState } from "react";

interface OrderItem { id: string; name: string; price: number; quantity: number; }
interface Order {
  id: string; createdAt: string; customerName: string; customerPhone: string;
  pickupTime: string; deliveryType: "pickup" | "delivery"; deliveryAddress: string | null;
  shippingCost: number; total: number; items: OrderItem[]; status: string; reglaError?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Í bið",
  confirmed: "Staðfest",
  ready: "Tilbúið",
  delivered: "Afhent",
  cancelled: "Afturkallað",
};

const STATUS_COLORS: Record<string, string> = {
  pending:   "bg-yellow-100 text-yellow-800",
  confirmed: "bg-blue-100 text-blue-800",
  ready:     "bg-green-100 text-green-800",
  delivered: "bg-gray-100 text-gray-600",
  cancelled: "bg-red-100 text-red-700",
};

function fmt(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("is-IS", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function krona(n: number) { return n.toLocaleString("is-IS") + " kr."; }

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/orders");
    const data = await res.json();
    setOrders(data);
    setLoading(false);
  }

  async function setStatus(id: string, status: string) {
    await fetch("/api/admin/orders", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
  }

  useEffect(() => { load(); }, []);

  const filtered = filter === "all" ? orders : orders.filter((o) => o.status === filter);
  const pending = orders.filter((o) => o.status === "pending").length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="bg-[#eb1515] text-white px-6 py-4 flex items-center justify-between shadow">
        <div>
          <h1 className="text-xl font-bold">Hlíðarkaup — Pantanir</h1>
          {pending > 0 && (
            <p className="text-red-200 text-sm">{pending} pöntun{pending !== 1 ? "ir" : ""} í bið</p>
          )}
        </div>
        <button
          onClick={load}
          className="bg-white/20 hover:bg-white/30 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          🔄 Uppfæra
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Filter tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {["all", "pending", "confirmed", "ready", "delivered", "cancelled"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                filter === s
                  ? "bg-[#eb1515] text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:border-[#eb1515]"
              }`}
            >
              {s === "all" ? `Allar (${orders.length})` : `${STATUS_LABELS[s]} (${orders.filter((o) => o.status === s).length})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-2">📭</p>
            <p className="font-medium">Engar pantanir</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Header row */}
                <div
                  className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-gray-900">{order.customerName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                      {order.reglaError && (
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Ekki í Reglu</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5">
                      <span>📞 {order.customerPhone}</span>
                      <span>{order.deliveryType === "delivery" ? "🚚 Heimsending" : "🏪 Sækir sjálfur"}</span>
                      <span>🕐 {order.pickupTime}</span>
                      <span className="text-gray-400">{fmt(order.createdAt)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-gray-900">{krona(order.total)}</div>
                    <div className="text-xs text-gray-400">{order.items.length} vara{order.items.length !== 1 ? "r" : ""}</div>
                  </div>
                  <span className="text-gray-400 text-lg">{expanded === order.id ? "▲" : "▼"}</span>
                </div>

                {/* Expanded detail */}
                {expanded === order.id && (
                  <div className="border-t border-gray-100 px-5 py-4 space-y-4">
                    {/* Items */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Vörur</h4>
                      <div className="space-y-1">
                        {order.items.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-700">{item.quantity}× {item.name}</span>
                            <span className="text-gray-600">{krona(item.price * item.quantity)}</span>
                          </div>
                        ))}
                        {order.shippingCost > 0 && (
                          <div className="flex justify-between text-sm text-gray-500 pt-1 border-t border-dashed border-gray-200">
                            <span>Sendingarkostnaður</span>
                            <span>{krona(order.shippingCost)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-bold pt-1 border-t border-gray-200">
                          <span>Samtals</span>
                          <span>{krona(order.total)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Delivery address */}
                    {order.deliveryAddress && (
                      <div>
                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Heimilisfang</h4>
                        <p className="text-sm text-gray-700">{order.deliveryAddress}</p>
                      </div>
                    )}

                    {/* Status buttons */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Breyta stöðu</h4>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(STATUS_LABELS).map(([key, label]) => (
                          <button
                            key={key}
                            onClick={() => setStatus(order.id, key)}
                            disabled={order.status === key}
                            className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                              order.status === key
                                ? "bg-[#eb1515] text-white cursor-default"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-gray-400">Pöntunarnúmer: {order.id}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
