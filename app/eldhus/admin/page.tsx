"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseEnabled } from "@/lib/supabase/client";
import { C } from "../theme";

const serif = { fontFamily: "var(--font-eldhus-serif)" } as const;

interface MealRow {
  id?: string;
  slug: string;
  title: string;
  tag: string;
  minutes: number;
  kcal: number;
  blurb: string;
  description: string;
  ingredients: string[];
  allergens: string[];
  image_url: string | null;
  from_color: string;
  to_color: string;
  published: boolean;
  position: number;
}

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

export default function AdminPage() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [authed, setAuthed] = useState(false);
  const [authErr, setAuthErr] = useState("");
  const [meals, setMeals] = useState<MealRow[]>([]);
  const [editing, setEditing] = useState<MealRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [tab, setTab] = useState<"meals" | "orders">("meals");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [orders, setOrders] = useState<any[]>([]);

  const loadMeals = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("meals").select("*").order("position", { ascending: true });
    setMeals((data as MealRow[]) ?? []);
  }, []);

  const loadOrders = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setOrders(data ?? []);
  }, []);

  async function setOrderStatus(id: string, status: string) {
    if (!supabase) return;
    await supabase.from("orders").update({ status }).eq("id", id);
    loadOrders();
  }

  useEffect(() => {
    if (!supabaseEnabled || !supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session);
      setReady(true);
      if (data.session) { loadMeals(); loadOrders(); }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
      if (session) { loadMeals(); loadOrders(); }
    });
    return () => sub.subscription.unsubscribe();
  }, [loadMeals, loadOrders]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setAuthErr("");
    const { error } = await supabase!.auth.signInWithPassword({ email, password: pass });
    if (error) setAuthErr("Innskráning mistókst. Athugaðu netfang og lykilorð.");
  }

  async function uploadPhoto(file: File) {
    if (!supabase || !editing) return;
    setUploading(true);
    const path = `${editing.slug || slugify(editing.title) || Date.now()}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error } = await supabase.storage.from("meal-photos").upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from("meal-photos").getPublicUrl(path);
      setEditing({ ...editing, image_url: data.publicUrl });
    }
    setUploading(false);
  }

  async function save() {
    if (!supabase || !editing) return;
    setSaving(true);
    const row = { ...editing, slug: editing.slug || slugify(editing.title), updated_at: new Date().toISOString() };
    const { error } = await supabase.from("meals").upsert(row, { onConflict: "slug" });
    setSaving(false);
    if (!error) { setEditing(null); loadMeals(); }
    else alert("Vistun mistókst: " + error.message);
  }

  async function remove(m: MealRow) {
    if (!supabase || !m.id || !confirm(`Eyða „${m.title}“?`)) return;
    await supabase.from("meals").delete().eq("id", m.id);
    loadMeals();
  }

  async function togglePublish(m: MealRow) {
    if (!supabase || !m.id) return;
    await supabase.from("meals").update({ published: !m.published }).eq("id", m.id);
    loadMeals();
  }

  if (!ready) return <Center>…</Center>;

  if (!supabaseEnabled) {
    return (
      <Center>
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold mb-3" style={{ ...serif, color: C.deep }}>Bakvinnsla óuppsett</h1>
          <p style={{ color: C.muted }}>
            Bættu við <code>NEXT_PUBLIC_SUPABASE_URL</code> og <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> og keyrðu <code>supabase/schema.sql</code>.
          </p>
        </div>
      </Center>
    );
  }

  if (!authed) {
    return (
      <Center>
        <form onSubmit={signIn} className="w-full max-w-sm bg-white rounded-3xl shadow-sm p-8">
          <h1 className="text-2xl font-bold mb-6 text-center" style={{ ...serif, color: C.deep }}>SVO GOTT · Stjórnborð</h1>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Netfang" type="email"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-3 outline-none" />
          <input value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Lykilorð" type="password"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-4 outline-none" />
          {authErr && <p className="text-sm mb-3" style={{ color: C.red }}>{authErr}</p>}
          <button type="submit" className="w-full font-bold py-3 rounded-xl text-white" style={{ backgroundColor: C.red }}>Innskrá</button>
        </form>
      </Center>
    );
  }

  const newOrders = orders.filter((o) => o.status === "new").length;
  const ordersLabel = "Pantanir" + (newOrders ? ` (${newOrders})` : "");
  const TABS: [("meals" | "orders"), string][] = [["meals", "Matseðill"], ["orders", ordersLabel]];

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold" style={{ ...serif, color: C.deep }}>Stjórnborð</h1>
        <div className="flex gap-3">
          {tab === "meals" && (
            <button onClick={() => setEditing({ ...BLANK, position: meals.length + 1 })}
              className="font-bold px-5 py-2.5 rounded-full text-white" style={{ backgroundColor: C.red }}>+ Ný uppskrift</button>
          )}
          <button onClick={() => supabase!.auth.signOut()}
            className="font-semibold px-4 py-2.5 rounded-full" style={{ border: `1px solid ${C.tealSoft}`, color: C.deep }}>Útskrá</button>
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
                    {o.delivery_type === "delivery" ? `Heimsending · ${o.address ?? ""}` : "Sókn í verslun"} · {o.delivery_date ? `${o.delivery_date} ` : ""}{o.pickup_time}
                  </p>
                  <p className="text-sm mt-1" style={{ color: C.ink }}>
                    {(o.items ?? []).map((it: { title: string }) => it.title).join(", ")}
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
