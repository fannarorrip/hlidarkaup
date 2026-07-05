"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { C } from "../theme";
import { dags } from "@/lib/format";
import type { MealRow } from "@/lib/eldhus-admin";
import type { EldhusOrder } from "@/lib/eldhus-orders";

const serif = { fontFamily: "var(--font-eldhus-serif)" } as const;

const BLANK: MealRow = {
  slug: "", title: "", tag: "", minutes: 30, kcal: 0, blurb: "", description: "",
  ingredients: [], allergens: [], image_url: null, from_color: "#8CC7C4", to_color: "#2C687B",
  published: true, position: 0,
};

function slugify(s: string) {
  return s.toLowerCase().trim()
    .replace(/[áàä]/g, "a").replace(/[éè]/g, "e").replace(/[íì]/g, "i").replace(/[óòö]/g, "o")
    .replace(/[úùü]/g, "u").replace(/ý/g, "y").replace(/þ/g, "th").replace(/æ/g, "ae").replace(/ð/g, "d")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export default function AdminClient({ email, roleLabel, enabled }: { email: string; roleLabel: string; enabled: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [orders, setOrders] = useState<EldhusOrder[]>([]);
  const [editing, setEditing] = useState<MealRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"meals" | "orders">("meals");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/eldhus/admin", { cache: "no-store" });
      const d = await r.json();
      if (d.ok) { setMeals(d.meals ?? []); setOrders(d.orders ?? []); }
    } catch { /* transient */ }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (enabled) load(); else setLoading(false); }, [enabled, load]);

  async function act(body: Record<string, unknown>): Promise<boolean> {
    setErr("");
    try {
      const r = await fetch("/api/eldhus/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!d.ok) { setErr(d.message || "Aðgerð mistókst."); return false; }
      return true;
    } catch { setErr("Aðgerð mistókst."); return false; }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    const row = { ...editing, slug: editing.slug || slugify(editing.title) };
    const ok = await act({ action: "saveMeal", meal: row });
    setSaving(false);
    if (ok) { setEditing(null); load(); }
  }
  async function remove(m: MealRow) {
    if (!m.id || !confirm(`Eyða „${m.title}“?`)) return;
    if (await act({ action: "deleteMeal", id: m.id })) load();
  }
  async function togglePublish(m: MealRow) {
    if (!m.id) return;
    if (await act({ action: "togglePublish", id: m.id, published: !m.published })) load();
  }
  async function setOrderStatus(id: string, status: string) {
    if (await act({ action: "orderStatus", id, status })) load();
  }
  async function uploadPhoto(file: File) {
    if (!editing) return;
    setUploading(true); setErr("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("name", editing.slug || slugify(editing.title) || "mynd");
      const r = await fetch("/api/eldhus/admin/upload", { method: "POST", body: fd });
      const d = await r.json();
      if (d.ok && d.url) setEditing((e) => (e ? { ...e, image_url: d.url } : e));
      else setErr(d.message || "Upphleðsla mistókst.");
    } catch { setErr("Upphleðsla mistókst."); }
    finally { setUploading(false); }
  }
  async function logout() {
    await fetch("/api/auth/staff/logout", { method: "POST" });
    router.replace("/starf/login");
    router.refresh();
  }

  if (!enabled) {
    return (
      <Center>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-3" style={{ ...serif, color: C.deep }}>Bakvinnsla óuppsett</h1>
          <p style={{ color: C.muted }}>Bættu við <code>SUPABASE_SERVICE_ROLE_KEY</code> í .env.local á þjóninum.</p>
        </div>
      </Center>
    );
  }
  if (loading) return <Center><p style={{ color: C.muted }}>Sæki gögn…</p></Center>;

  const newOrders = orders.filter((o) => o.status === "new").length;
  const ordersLabel = "Pantanir" + (newOrders ? ` (${newOrders})` : "");
  const TABS: [("meals" | "orders"), string][] = [["meals", "Matseðill"], ["orders", ordersLabel]];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      {/* Staff bar — same session as everywhere else */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-3xl font-bold" style={{ ...serif, color: C.deep }}>Stjórnborð</h1>
          <p className="text-sm mt-0.5" style={{ color: C.muted }}>{email} · {roleLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {tab === "meals" && (
            <button onClick={() => setEditing({ ...BLANK, position: meals.length + 1 })}
              className="font-bold px-5 py-2.5 rounded-full text-white" style={{ backgroundColor: C.red }}>+ Ný uppskrift</button>
          )}
          <Link href="/starf" className="font-semibold px-4 py-2.5 rounded-full" style={{ border: `1px solid ${C.tealSoft}`, color: C.deep }}>Starfsmannakerfi</Link>
          <button onClick={logout} className="font-semibold px-4 py-2.5 rounded-full" style={{ border: `1px solid ${C.tealSoft}`, color: C.deep }}>Útskrá</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-8">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className="px-5 py-2 rounded-full text-sm font-bold transition-colors"
            style={tab === key ? { backgroundColor: C.deep, color: "#fff" } : { backgroundColor: "#fff", color: C.deep, border: `1px solid ${C.tealSoft}` }}>
            {label}
          </button>
        ))}
      </div>

      {err && <p className="mb-4 text-sm font-semibold" style={{ color: C.red }}>{err}</p>}

      {tab === "orders" && (
        <div className="space-y-3">
          {orders.length === 0 && <p style={{ color: C.muted }}>Engar pantanir enn.</p>}
          {orders.map((o) => (
            <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-bold" style={{ color: C.ink }}>
                    #{o.ref} · {o.customer_name || "—"}
                    {o.plan === "subscription" && <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: C.tealSoft, color: C.deep }}>Áskrift</span>}
                  </p>
                  <p className="text-sm" style={{ color: C.muted }}>
                    {o.delivery_type === "delivery" ? `Heimsending · ${o.address ?? ""}` : "Sókn í verslun"} · {o.delivery_date ? `${dags(o.delivery_date)} ` : ""}{o.pickup_time}
                  </p>
                  <p className="text-sm mt-1" style={{ color: C.ink }}>
                    {(o.items ?? []).map((it) => it.title).join(", ")}
                  </p>
                  <p className="text-xs mt-1" style={{ color: C.muted }}>
                    {o.meals} réttir × {o.portions} manna · {o.customer_phone} · {Number(o.total).toLocaleString("is-IS")} kr.
                  </p>
                </div>
                <select value={o.status} onChange={(e) => setOrderStatus(o.id, e.target.value)}
                  className="text-sm font-semibold rounded-lg border px-2 py-1.5 shrink-0"
                  style={{ borderColor: C.tealSoft, color: C.deep }}>
                  <option value="new">Ný</option>
                  <option value="preparing">Í vinnslu</option>
                  <option value="done">Tilbúin</option>
                </select>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "meals" && (
        <div className="space-y-3">
          {meals.map((m) => (
            <div key={m.id ?? m.slug} className="flex items-center gap-4 bg-white rounded-2xl p-3 shadow-sm">
              <div className="w-16 h-16 rounded-xl bg-cover bg-center shrink-0"
                style={m.image_url ? { backgroundImage: `url(${m.image_url})` } : { background: `linear-gradient(150deg, ${m.from_color}, ${m.to_color})` }} />
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate" style={{ color: C.ink }}>{m.title}</p>
                <p className="text-sm" style={{ color: C.muted }}>{m.tag} · {m.minutes} mín · {m.kcal} kcal</p>
              </div>
              <button onClick={() => togglePublish(m)} className="text-xs font-bold px-3 py-1.5 rounded-full"
                style={m.published ? { backgroundColor: C.tealSoft, color: C.deep } : { backgroundColor: "#f3f4f6", color: "#9ca3af" }}>
                {m.published ? "Birt" : "Drög"}
              </button>
              <button onClick={() => setEditing(m)} className="font-semibold text-sm px-3 py-1.5" style={{ color: C.deep }}>Breyta</button>
              <button onClick={() => remove(m)} className="text-sm px-2" style={{ color: C.red }}>🗑</button>
            </div>
          ))}
          {meals.length === 0 && <p style={{ color: C.muted }}>Engar uppskriftir enn. Smelltu á „Ný uppskrift“.</p>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6 overflow-y-auto" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6 p-7" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold mb-5" style={{ ...serif, color: C.deep }}>{editing.id ? "Breyta uppskrift" : "Ný uppskrift"}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Heiti" full><input className={inp} value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value, slug: editing.id ? editing.slug : slugify(e.target.value) })} /></Field>
              <Field label="Flokkur"><input className={inp} value={editing.tag} onChange={(e) => setEditing({ ...editing, tag: e.target.value })} placeholder="Fiskur / Kjúklingur ..." /></Field>
              <Field label="Staða"><select className={inp} value={editing.published ? "1" : "0"} onChange={(e) => setEditing({ ...editing, published: e.target.value === "1" })}><option value="1">Birt</option><option value="0">Drög</option></select></Field>
              <Field label="Eldunartími (mín)"><input className={inp} type="number" value={editing.minutes} onChange={(e) => setEditing({ ...editing, minutes: +e.target.value })} /></Field>
              <Field label="Hitaeiningar (kcal)"><input className={inp} type="number" value={editing.kcal} onChange={(e) => setEditing({ ...editing, kcal: +e.target.value })} /></Field>
              <Field label="Stutt lýsing (á korti)" full><input className={inp} value={editing.blurb} onChange={(e) => setEditing({ ...editing, blurb: e.target.value })} /></Field>
              <Field label="Lýsing" full><textarea className={`${inp} h-24`} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
              <Field label="Hráefni (aðgreint með kommu)" full><textarea className={`${inp} h-20`} value={editing.ingredients.join(", ")} onChange={(e) => setEditing({ ...editing, ingredients: splitList(e.target.value) })} /></Field>
              <Field label="Ofnæmisvaldar (kommu)" full><input className={inp} value={editing.allergens.join(", ")} onChange={(e) => setEditing({ ...editing, allergens: splitList(e.target.value) })} /></Field>
              <Field label="Mynd" full>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-xl bg-cover bg-center shrink-0"
                    style={editing.image_url ? { backgroundImage: `url(${editing.image_url})` } : { background: `linear-gradient(150deg, ${editing.from_color}, ${editing.to_color})` }} />
                  <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
                  {uploading && <span className="text-sm" style={{ color: C.muted }}>Hleð upp…</span>}
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditing(null)} className="font-semibold px-5 py-2.5 rounded-full" style={{ border: `1px solid ${C.tealSoft}`, color: C.deep }}>Hætta við</button>
              <button onClick={save} disabled={saving || !editing.title} className="font-bold px-6 py-2.5 rounded-full text-white disabled:opacity-40" style={{ backgroundColor: C.red }}>{saving ? "Vista…" : "Vista"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

const inp = "w-full border border-gray-200 rounded-xl px-3 py-2 outline-none text-sm";

function splitList(s: string) {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-bold uppercase tracking-wide mb-1" style={{ color: C.muted }}>{label}</span>
      {children}
    </label>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <main className="min-h-[70vh] flex items-center justify-center px-6">{children}</main>;
}
