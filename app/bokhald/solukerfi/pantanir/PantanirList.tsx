"use client";
// Shared order list for both Pantanir pages (vefverslun + eldhús). The server pages normalise
// each store into PantunView[] and pass channel-specific status options. Status updates go to
// the gated /api/pantanir/{channel} PATCH and are applied optimistically.
import { useState } from "react";

export interface PantunView {
  id: string;
  createdAtLabel: string;
  ref: string;
  customerName: string;
  customerPhone: string | null;
  fulfilment: string;
  when: string;
  total: number;
  lineItems: { label: string; qty?: number; amount?: number }[];
  status: string;
  badges: string[];
  extra: { label: string; value: string }[];
}
export interface StatusOpt { key: string; label: string; cls: string }

const kr = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") + " kr.";

export default function PantanirList({ orders, statuses, channel }: { orders: PantunView[]; statuses: StatusOpt[]; channel: "vefverslun" | "eldhus" }) {
  const [list, setList] = useState(orders);
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const stLabel = (k: string) => statuses.find((s) => s.key === k)?.label ?? k;
  const stCls = (k: string) => statuses.find((s) => s.key === k)?.cls ?? "bg-[#E4F1F0] text-[#5C6B72]";

  async function setStatus(id: string, status: string) {
    setBusy(id);
    const prevStatus = list.find((o) => o.id === id)?.status;
    setList((l) => l.map((o) => (o.id === id ? { ...o, status } : o)));
    const r = await fetch(`/api/pantanir/${channel}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }),
    });
    setBusy(null);
    // Revert only the affected row, so a concurrent update to another row isn't clobbered.
    if (!r.ok && prevStatus !== undefined) setList((l) => l.map((o) => (o.id === id ? { ...o, status: prevStatus } : o)));
  }

  const filtered = filter === "all" ? list : list.filter((o) => o.status === filter);
  const countFor = (k: string) => list.filter((o) => o.status === k).length;

  return (
    <div>
      {/* Filter chips */}
      <div className="flex gap-2 flex-wrap mb-6">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label={`Allar (${list.length})`} />
        {statuses.map((s) => (
          <Chip key={s.key} active={filter === s.key} onClick={() => setFilter(s.key)} label={`${s.label} (${countFor(s.key)})`} />
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-[#5C6B72] bg-white rounded-2xl border border-[#E4F1F0]">
          <p className="text-3xl mb-2">📭</p>
          <p>{list.length === 0 ? "Engar pantanir" : "Engar pantanir í þessari stöðu"}</p>
          {list.length > 0 && (
            <button onClick={() => setFilter("all")} className="mt-3 text-sm font-medium text-[#2C687B] hover:underline">Sýna allar</button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl border border-[#E4F1F0] overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-[#FBFDFC]" onClick={() => setOpen(open === o.id ? null : o.id)}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="font-bold text-[#21323A]">{o.customerName}</span>
                    <span className="text-xs text-[#5C6B72]">#{o.ref}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stCls(o.status)}`}>{stLabel(o.status)}</span>
                    {o.badges.map((b) => (
                      <span key={b} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{b}</span>
                    ))}
                  </div>
                  <div className="text-sm text-[#5C6B72] flex flex-wrap gap-x-3 gap-y-0.5">
                    {o.customerPhone && <span>📞 {o.customerPhone}</span>}
                    <span>{o.fulfilment}</span>
                    {o.when && <span>🕐 {o.when}</span>}
                    <span className="text-[#9DB0B6]">{o.createdAtLabel}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[#21323A]">{kr(o.total)}</div>
                  <div className="text-xs text-[#9DB0B6]">{o.lineItems.length} {o.lineItems.length === 1 ? "lína" : "línur"}</div>
                </div>
                <span className="text-[#9DB0B6]">{open === o.id ? "▲" : "▼"}</span>
              </div>

              {open === o.id && (
                <div className="border-t border-[#E4F1F0] px-5 py-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-[#5C6B72] uppercase tracking-wide mb-2">Vörur</h4>
                    <div className="space-y-1">
                      {o.lineItems.map((it, i) => (
                        <div key={i} className="flex justify-between text-sm">
                          <span className="text-[#21323A]">{it.qty ? `${it.qty}× ` : ""}{it.label}</span>
                          {it.amount != null && <span className="text-[#5C6B72]">{kr(it.amount)}</span>}
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-bold pt-1 border-t border-[#E4F1F0]">
                        <span>Samtals</span><span>{kr(o.total)}</span>
                      </div>
                    </div>
                  </div>

                  {o.extra.length > 0 && (
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
                      {o.extra.map((e) => (
                        <div key={e.label} className="flex justify-between text-sm">
                          <span className="text-[#5C6B72]">{e.label}</span><span className="text-[#21323A]">{e.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <h4 className="text-xs font-semibold text-[#5C6B72] uppercase tracking-wide mb-2">Breyta stöðu</h4>
                    <div className="flex flex-wrap gap-2">
                      {statuses.map((s) => (
                        <button key={s.key} onClick={() => setStatus(o.id, s.key)} disabled={o.status === s.key || busy === o.id}
                          className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-60 ${
                            o.status === s.key ? "bg-[#2C687B] text-white cursor-default" : "bg-[#E4F1F0] text-[#2C687B] hover:bg-[#d4e9e7]"
                          }`}>
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-[#9DB0B6]">Pöntunarnúmer: {o.ref}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
        active ? "bg-[#2C687B] text-white" : "bg-white text-[#5C6B72] border border-[#E4F1F0] hover:border-[#8CC7C4]"
      }`}>
      {label}
    </button>
  );
}
