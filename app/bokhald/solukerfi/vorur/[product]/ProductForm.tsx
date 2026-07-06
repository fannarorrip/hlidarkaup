"use client";
import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { ProductDetail } from "@/lib/accounting-queries";
import { kr } from "@/lib/format";
import { kbHealth, kbScanEvents } from "@/lib/kassabru";

const inp = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400";

// Næringargildistaflan í 100 g/ml — röðin fylgir reglugerð (EU 1169/2011).
const NUTRITION_FIELDS: [string, string][] = [
  ["orka_kj", "Orka (kJ)"],
  ["orka_kcal", "Orka (kcal)"],
  ["fita", "Fita (g)"],
  ["mettadar_fitusyrur", "þar af mettaðar fitusýrur (g)"],
  ["kolvetni", "Kolvetni (g)"],
  ["sykrur", "þar af sykrur (g)"],
  ["trefjar", "Trefjar (g)"],
  ["protein", "Prótein (g)"],
  ["salt", "Salt (g)"],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">{title}</p>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer py-1">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-red-600" />
      {label}
    </label>
  );
}

export default function ProductForm({ product, barcodes: initialBarcodes, salesHint }: { product: ProductDetail; barcodes: string[]; salesHint?: { sold30: number; monthly: number; suggested: number; basis: "sales" | "manual" } }) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [group, setGroup] = useState(product.product_group ?? "");
  const [unit, setUnit] = useState(product.unit_code ?? "");
  const [desc, setDesc] = useState(product.description ?? "");
  const [vat, setVat] = useState(String(Number(product.vat_rate)));
  const [gross, setGross] = useState(String(product.price_gross));
  const [stockControlled, setStockControlled] = useState(product.is_stock_controlled);
  const [stock, setStock] = useState(String(Math.floor(Number(product.stock_quantity))));
  const [reorderPoint, setReorderPoint] = useState(product.reorder_point != null ? String(Math.round(Number(product.reorder_point))) : "");
  const [reorderQty, setReorderQty] = useState(product.reorder_qty != null ? String(Math.round(Number(product.reorder_qty))) : "");
  const [useScale, setUseScale] = useState(product.use_scale);
  const [allowDiscount, setAllowDiscount] = useState(product.allow_discount);
  const [isActive, setIsActive] = useState(product.is_active);

  const [barcodes, setBarcodes] = useState<string[]>(initialBarcodes);
  const [newBarcode, setNewBarcode] = useState("");
  const [bcError, setBcError] = useState("");

  const [imageUrl, setImageUrl] = useState(product.image_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState("");

  const [innihald, setInnihald] = useState(product.innihald ?? "");
  const [allergens, setAllergens] = useState(product.ofnaemisvaldar ?? "");
  const [nutrition, setNutrition] = useState<Record<string, string>>(() => {
    const n = (product.naeringargildi ?? {}) as Record<string, number | null>;
    return Object.fromEntries(NUTRITION_FIELDS.map(([k]) => [k, n[k] != null ? String(n[k]) : ""]));
  });
  const [nettoMagn, setNettoMagn] = useState(product.netto_magn ?? "");
  const [uppruni, setUppruni] = useState(product.uppruni ?? "");
  const [infoSource, setInfoSource] = useState(product.info_source ?? "");
  const [labelReading, setLabelReading] = useState(false);
  const [labelError, setLabelError] = useState("");
  const [labelOk, setLabelOk] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const vatNum = Number(vat);
  const grossNum = Number(gross) || 0;
  const net = vatNum >= 0 ? grossNum / (1 + vatNum / 100) : grossNum;

  async function save() {
    setSaving(true); setError(""); setSaved(false);
    try {
      const res = await fetch(`/api/products/${product.product_number}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name, product_group: group, unit_code: unit, description: desc, vat_rate: vatNum, price_gross: grossNum,
          is_stock_controlled: stockControlled, stock_quantity: Number(stock),
          use_scale: useScale, allow_discount: allowDiscount, is_active: isActive,
          reorder_point: reorderPoint, reorder_qty: reorderQty,
          innihald, ofnaemisvaldar: allergens, naeringargildi: buildNutrition(),
          netto_magn: nettoMagn, uppruni, info_source: infoSource || "manual",
        }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? "Vistun mistókst"); return; }
      setSaved(true);
      router.refresh();
    } catch { setError("Samband rofnaði"); } finally { setSaving(false); }
  }

  async function uploadPhoto(file: File) {
    setUploading(true); setImgError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/products/${product.product_number}/photo`, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setImgError(d.error ?? "Upphleðsla mistókst"); return; }
      setImageUrl(d.image_url);
    } catch { setImgError("Samband rofnaði"); } finally { setUploading(false); }
  }
  async function removePhoto() {
    setImgError("");
    const res = await fetch(`/api/products/${product.product_number}/photo`, { method: "DELETE" });
    if (res.ok) setImageUrl(null);
    else setImgError("Tókst ekki að fjarlægja mynd");
  }

  /** Nutrition inputs → jsonb object (Icelandic decimal comma accepted); null when all empty. */
  function buildNutrition(): Record<string, number | null> | null {
    const obj: Record<string, number | null> = {};
    let any = false;
    for (const [k] of NUTRITION_FIELDS) {
      const raw = (nutrition[k] ?? "").trim().replace(",", ".");
      const v = raw === "" ? NaN : Number(raw);
      obj[k] = Number.isFinite(v) ? v : null;
      if (Number.isFinite(v)) any = true;
    }
    return any ? obj : null;
  }

  // AI: photos of the packaging → innihald + ofnæmisvaldar + næringartafla fill the
  // fields below for review. Nothing is saved until the normal "Vista breytingar".
  async function readLabel(files: FileList) {
    setLabelReading(true); setLabelError(""); setLabelOk(false);
    try {
      const fd = new FormData();
      Array.from(files).slice(0, 6).forEach((f) => fd.append("file", f));
      const res = await fetch(`/api/products/${product.product_number}/label`, { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setLabelError(d.error ?? "Lestur mistókst"); return; }
      const info = d.info ?? {};
      if (info.innihald) setInnihald(info.innihald);
      if (Array.isArray(info.ofnaemisvaldar) && info.ofnaemisvaldar.length) setAllergens(info.ofnaemisvaldar.join(", "));
      if (info.naeringargildi) {
        const n = info.naeringargildi as Record<string, number | null>;
        setNutrition(Object.fromEntries(NUTRITION_FIELDS.map(([k]) => [k, n[k] != null ? String(n[k]) : ""])));
      }
      if (info.netto_magn) setNettoMagn(info.netto_magn);
      if (info.uppruni) setUppruni(info.uppruni);
      setInfoSource("label_ai");
      setLabelOk(true);
    } catch { setLabelError("Samband rofnaði"); } finally { setLabelReading(false); }
  }

  // Physical barcode scanner (kassabrú, when this page is open on the till PC): a scan fills
  // the new-barcode box — attaching still takes the explicit "+ Bæta við" click, so a stray
  // scan can't silently link the wrong barcode to a product.
  useEffect(() => {
    let stop = false;
    let cleanup: (() => void) | undefined;
    kbHealth().then((ok) => { if (!stop && ok) cleanup = kbScanEvents((code) => setNewBarcode(code)); });
    return () => { stop = true; cleanup?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addBarcode() {
    const bc = newBarcode.trim();
    if (!bc) return;
    setBcError("");
    const res = await fetch(`/api/products/${product.product_number}/barcode`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ barcode: bc }),
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); setBcError(d.error ?? "Mistókst"); return; }
    setBarcodes((p) => [...p, bc].sort()); setNewBarcode("");
  }
  async function removeBarcode(bc: string) {
    await fetch(`/api/products/${product.product_number}/barcode?barcode=${encodeURIComponent(bc)}`, { method: "DELETE" });
    setBarcodes((p) => p.filter((x) => x !== bc));
  }

  return (
    <div className="space-y-4 max-w-4xl pb-24">
      <Section title="Vara">
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Vörunúmer">
            <input value={product.product_number} disabled className={`${inp} bg-gray-50 text-gray-500`} />
          </Field>
          <Field label="Heiti *"><input value={name} onChange={(e) => setName(e.target.value)} className={inp} /></Field>
          <Field label="Vöruflokkur"><input value={group} onChange={(e) => setGroup(e.target.value)} placeholder="—" className={inp} /></Field>
          <Field label="Magneining"><input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="t.d. C62 / kg / l" className={inp} /></Field>
          <div className="md:col-span-3">
            <Field label="Lýsing"><textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className={inp} /></Field>
          </div>
        </div>
      </Section>

      <Section title="Verðlagning">
        <div className="grid md:grid-cols-3 gap-4 items-end">
          <Field label="Söluverð m/VSK (kr.)">
            <input type="number" value={gross} onChange={(e) => setGross(e.target.value)} className={inp} />
          </Field>
          <Field label="VSK þrep">
            <select value={vat} onChange={(e) => setVat(e.target.value)} className={`${inp} bg-white`}>
              <option value="24">24%</option>
              <option value="11">11%</option>
              <option value="0">0% / undanþegið</option>
            </select>
          </Field>
          <div className="text-sm text-gray-500">
            <p>Verð án VSK: <span className="font-medium text-gray-800">{kr(net)}</span></p>
            <p>VSK: <span className="font-medium text-gray-800">{kr(grossNum - net)}</span></p>
          </div>
        </div>
      </Section>

      <Section title="Birgðir">
        <div className="grid md:grid-cols-3 gap-4 items-end">
          <Field label="Birgðastaða (stk.)">
            <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className={inp} />
          </Field>
          <Field label="Öryggisbirgðir (panta við stöðu ≤)">
            <input type="number" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} placeholder="—" className={inp} />
          </Field>
          <Field label="Tillaga að pöntunarmagni">
            <input type="number" value={reorderQty} onChange={(e) => setReorderQty(e.target.value)} placeholder="—" className={inp} />
          </Field>
        </div>
        {salesHint && salesHint.basis === "sales" && (
          <p className="mt-2 text-xs text-gray-500">
            Selt síðustu 30 daga: <b className="text-gray-700">{salesHint.sold30}</b> · ≈ {salesHint.monthly}/mán ·{" "}
            Tillaga skv. sölu: <b className="text-gray-700">{salesHint.suggested}</b>
            <button type="button" onClick={() => setReorderQty(String(salesHint.suggested))} className="ml-2 text-red-600 hover:underline">Nota</button>
          </p>
        )}
        <div className="mt-3"><Check checked={stockControlled} onChange={setStockControlled} label="Birgðastýring virk (fylgjast með lager)" /></div>
      </Section>

      <Section title="Mynd (birtist á kassa- og sjálfsafgreiðslu-flísum)">
        <div className="flex items-center gap-4">
          {imageUrl ? (
            <div className="w-24 h-24 rounded-xl bg-gray-50 bg-cover bg-center border border-gray-200 shrink-0" style={{ backgroundImage: `url(${imageUrl})` }} />
          ) : (
            <div className="w-24 h-24 rounded-xl bg-gray-50 border border-dashed border-gray-300 shrink-0 flex items-center justify-center text-gray-300 text-xs text-center px-2">Engin mynd</div>
          )}
          <div className="space-y-2">
            <input type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} className="text-sm" />
            <div className="flex items-center gap-3 text-sm">
              {uploading && <span className="text-gray-500">Hleð upp…</span>}
              {imageUrl && !uploading && <button type="button" onClick={removePhoto} className="text-red-600 hover:underline">Fjarlægja mynd</button>}
              {imgError && <span className="text-red-600">{imgError}</span>}
            </div>
            <p className="text-xs text-gray-400">JPG/PNG/WebP, hámark 6MB. Sérstaklega gagnlegt fyrir ávexti og grænmeti (vörur án strikamerkis).</p>
          </div>
        </div>
      </Section>

      <Section title="Innihald & næring (birtist í vefverslun — skylda fyrir matvöru í fjarsölu)">
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 rounded-lg bg-red-50/60 border border-red-100">
          <label className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer ${labelReading ? "bg-gray-200 text-gray-400" : "bg-red-600 text-white hover:bg-red-700"}`}>
            {labelReading ? "Les af mynd…" : "📷 Lesa af mynd (AI)"}
            <input
              type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment"
              disabled={labelReading} className="hidden"
              onChange={(e) => { if (e.target.files?.length) readLabel(e.target.files); e.target.value = ""; }}
            />
          </label>
          <p className="text-xs text-gray-500 flex-1 min-w-[200px]">
            Taktu mynd af <b>bakhlið umbúðanna</b> (innihaldslýsing + næringargildistafla) — gervigreindin fyllir svæðin hér fyrir neðan. Yfirfarðu og vistaðu.
          </p>
          {labelOk && <span className="text-sm text-green-700">✓ Lesið af mynd — yfirfarðu</span>}
          {labelError && <span className="text-sm text-red-600">{labelError}</span>}
        </div>

        <div className="space-y-4">
          <Field label="Innihaldslýsing (ofnæmisvaldar í HÁSTÖFUM)">
            <textarea value={innihald} onChange={(e) => setInnihald(e.target.value)} rows={4} className={inp}
              placeholder="Hveiti, sykur, MJÓLKURDUFT, kakósmjör…" />
          </Field>
          <Field label="Ofnæmisvaldar (aðgreindir með kommu)">
            <input value={allergens} onChange={(e) => setAllergens(e.target.value)} placeholder="MJÓLK, GLÚTEN (HVEITI), EGG" className={inp} />
          </Field>

          <div>
            <p className="text-sm text-gray-500 mb-2">Næringargildi í 100 g / 100 ml</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {NUTRITION_FIELDS.map(([key, label]) => (
                <Field key={key} label={label}>
                  <input
                    inputMode="decimal" value={nutrition[key] ?? ""}
                    onChange={(e) => setNutrition((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder="—" className={inp}
                  />
                </Field>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Nettómagn"><input value={nettoMagn} onChange={(e) => setNettoMagn(e.target.value)} placeholder='t.d. "500 g" / "1 l"' className={inp} /></Field>
            <Field label="Upprunaland"><input value={uppruni} onChange={(e) => setUppruni(e.target.value)} placeholder="—" className={inp} /></Field>
          </div>

          {product.info_updated_at && (
            <p className="text-xs text-gray-400">
              Síðast uppfært {new Date(product.info_updated_at).toLocaleDateString("is-IS")}
              {product.info_source === "label_ai" ? " — lesið af mynd (AI)" : product.info_source === "supplier" ? " — frá birgja" : product.info_source === "off" ? " — Open Food Facts" : ""}
            </p>
          )}
        </div>
      </Section>

      <Section title="Eiginleikar">
        <Check checked={useScale} onChange={setUseScale} label="Vigtarvara (vog)" />
        <Check checked={allowDiscount} onChange={setAllowDiscount} label="Afsláttur leyfður" />
        <Check checked={isActive} onChange={setIsActive} label="Virk vara (sýnileg í kassa og sölu)" />
      </Section>

      <Section title="Strikamerki">
        <div className="flex gap-2 mb-3">
          <input
            value={newBarcode}
            onChange={(e) => setNewBarcode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addBarcode()}
            placeholder="Sláðu inn strikamerki…"
            className={inp}
          />
          <button onClick={addBarcode} className="shrink-0 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700">+ Bæta við</button>
        </div>
        {bcError && <p className="text-sm text-red-600 mb-2">{bcError}</p>}
        <div className="space-y-1.5">
          {barcodes.length === 0 ? (
            <p className="text-sm text-gray-400">Engin strikamerki skráð</p>
          ) : barcodes.map((bc) => (
            <div key={bc} className="flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2">
              <span className="font-mono text-sm">{bc}</span>
              <button onClick={() => removeBarcode(bc)} className="text-gray-300 hover:text-red-600 text-lg leading-none" aria-label="Fjarlægja">×</button>
            </div>
          ))}
        </div>
      </Section>

      <div className="fixed bottom-0 left-60 right-0 bg-white/90 backdrop-blur border-t border-gray-200 px-8 py-3 flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50"
        >
          {saving ? "Vista…" : "Vista breytingar"}
        </button>
        {saved && <span className="text-sm text-green-700">✓ Vistað</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
