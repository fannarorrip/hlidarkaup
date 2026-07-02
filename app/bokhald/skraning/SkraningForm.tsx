"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { kr } from "@/lib/format";
import SupplierPicker from "../SupplierPicker";

interface Acct { account_number: string; name: string; account_type: string; }
interface Line {
  date: string;        // display DD.MM.YYYY
  type: string;        // "Fjárhagur"
  acctText: string;    // "2100 — Vörukaup…"
  description: string;
  vat: string;         // "" | "24" | "11" | "0"
  amount: string;      // signed: + = debet, − = kredit
  hasDoc: boolean;
}
export interface ExtractLine { account?: string; description?: string; vatRate?: number; amount?: number; }
export interface ExtractData { supplier?: string; invoiceNumber?: string; date?: string; lines?: ExtractLine[]; }

function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmt(iso: string) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}.${m[2]}.${m[1]}` : iso; }
function toISO(display: string): string {
  const s = (display || "").trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = s.replace(/\D/g, "");
  if (d.length === 6) return `20${d.slice(4, 6)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
  if (d.length === 8) {
    const f4 = Number(d.slice(0, 4));
    return f4 >= 2000 && f4 <= 2100 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
  }
  return s;
}
const blank = (): Line => ({ date: fmt(todayISO()), type: "Fjárhagur", acctText: "", description: "", vat: "", amount: "", hasDoc: false });
const cell = "w-full bg-transparent px-2 py-1.5 text-sm outline-none focus:bg-red-50/60";
const PROMPT_KEY = "hk_skraning_prompts";
const fileOk = (f: File) => (/pdf|image\/(jpeg|jpg|png|webp)|sheet|excel|csv/i.test(f.type) || /\.(pdf|jpe?g|png|webp|xlsx?|csv)$/i.test(f.name)) && f.size <= 10 * 1024 * 1024;
const fileSize = (n: number) => n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export default function SkraningForm({ accounts, nextSkjalanumer, initialData, initialDocUrl, initialDocName, emailId, supplierName, supplierKennitala }: {
  accounts: Acct[]; nextSkjalanumer: number;
  initialData?: ExtractData; initialDocUrl?: string; initialDocName?: string; emailId?: string;
  supplierName?: string; supplierKennitala?: string;
}) {
  const router = useRouter();
  const emailMode = !!emailId;
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [heiti, setHeiti] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([blank(), blank()]);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docB64, setDocB64] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [docMime, setDocMime] = useState<string>("application/pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [readMsg, setReadMsg] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  // "Lesa skjal í dagbók" prompt window
  const [showRead, setShowRead] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [recents, setRecents] = useState<string[]>([]);
  const [working, setWorking] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [modalErr, setModalErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { try { const r = JSON.parse(localStorage.getItem(PROMPT_KEY) || "[]"); if (Array.isArray(r)) setRecents(r); } catch { /* ignore */ } }, []);

  // Email-review mode: pre-fill the grid from the extracted draft + link the stored attachment.
  useEffect(() => {
    if (initialData) fillFromData(initialData);
    if (initialDocUrl) { setDocUrl(initialDocUrl); setDocName(initialDocName ?? null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function saveRecent(t: string) {
    const s = (t || "").trim(); if (!s) return;
    setRecents((prev) => { const next = [s, ...prev.filter((x) => x !== s)].slice(0, 12); try { localStorage.setItem(PROMPT_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  }

  const skjalanr = String(nextSkjalanumer).padStart(6, "0");
  const acctLabel = (num: string) => { const a = accounts.find((x) => x.account_number === num); return a ? `${a.account_number} — ${a.name}` : num; };
  const resolveAcct = (text: string) => { const tok = (text || "").trim().split(/[\s—–-]+/)[0]; return accounts.find((a) => a.account_number === tok)?.account_number ?? ""; };

  const setLine = (i: number, k: keyof Line, v: string | boolean) => setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [k]: v } : l)));
  const addLine = () => setLines((p) => [...p, blank()]);
  const removeLine = (i: number) => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p));

  let debet = 0, kredit = 0;
  for (const l of lines) { const n = Number(l.amount) || 0; if (n > 0) debet += n; else kredit += -n; }
  const diff = debet - kredit;
  const balanced = Math.round(diff) === 0 && debet > 0;

  function clearDoc() { if (docUrl && docUrl.startsWith("blob:")) URL.revokeObjectURL(docUrl); setDocUrl(null); setDocB64(null); setDocName(null); setDocMime("application/pdf"); }
  function nyDagbok() { clearDoc(); setLines([blank(), blank()]); setHeiti(""); setReference(""); setReadMsg(""); setError(""); setOk(""); }
  function hreinsaLinur() { setLines([blank(), blank()]); }

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const good = incoming.filter(fileOk);
    if (good.length < incoming.length) setModalErr("Sum skjöl voru ekki tekin gild (gerð eða stærð > 10 MB).");
    setFiles((prev) => [...prev, ...good].slice(0, 10));
  }
  const toDataUrl = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });

  async function vinnaSkjal() {
    if (!files.length) return;
    setWorking("Les skjöl…"); setModalErr("");
    try {
      const payload = await Promise.all(files.map(async (f) => ({ name: f.name, mime: f.type || "", data: await toDataUrl(f) })));
      const resp = await fetch("/api/skraning/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ instructions, files: payload }) });
      const d = await resp.json();
      if (!resp.ok) { setModalErr(d.error ?? "Tókst ekki að lesa skjalið"); return; }
      fillFromData(d.data as ExtractData);
      clearDoc();
      setDocB64(payload[0].data); setDocName(payload[0].name); setDocMime(payload[0].mime || "application/pdf"); setDocUrl(URL.createObjectURL(files[0]));
      saveRecent(instructions);
      setShowRead(false); setFiles([]); setInstructions("");
    } catch (e) {
      setModalErr("Villa: " + (e instanceof Error ? e.message : ""));
    } finally { setWorking(""); }
  }

  function fillFromData(x: ExtractData) {
    const dISO = x.date || todayISO();
    const arr = Array.isArray(x.lines) ? x.lines : [];
    const L: Line[] = arr.filter((l) => Number(l.amount)).map((l) => ({
      date: fmt(dISO), type: "Fjárhagur", acctText: acctLabel(String(l.account ?? "")),
      description: String(l.description ?? ""), vat: l.vatRate ? String(l.vatRate) : "",
      amount: String(Math.round(Number(l.amount))), hasDoc: true,
    }));
    setLines(L.length ? L : [blank(), blank()]);
    setHeiti(x.supplier ? `Innkaup – ${x.supplier}` : "Skráning úr skjali");
    setReference(String(x.invoiceNumber ?? ""));
    setReadMsg(`Lesið: ${x.supplier || "skjal"}${x.invoiceNumber ? ` · nr. ${x.invoiceNumber}` : ""}. Yfirfarðu og skráðu.`);
  }

  async function post() {
    setBusy(true); setError(""); setOk("");
    const voucherDate = toISO(lines.find((l) => toISO(l.date))?.date || "") || undefined;
    const payloadLines = lines
      .map((l) => ({ account: resolveAcct(l.acctText), amount: Number(l.amount) || 0, vat_code: l.vat ? ({ "24": "I24", "11": "I11" } as Record<string, string>)[l.vat] || null : null, description: l.description }))
      .filter((l) => l.account && l.amount !== 0)
      .map((l) => ({ account: l.account, debit: l.amount > 0 ? l.amount : 0, credit: l.amount < 0 ? -l.amount : 0, vat_code: l.vat_code, description: l.description }));
    const url = emailMode ? `/api/skraning/email/${emailId}/approve` : "/api/skraning/post";
    const r = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: voucherDate, description: heiti || "Handvirk færsla", reference, lines: payloadLines, ...(emailMode ? { supplier_id: supplierId } : { pdf: docB64, filename: docName, mime: docMime }) }),
    });
    const d = await r.json(); setBusy(false);
    if (!r.ok) { setError(d.error ?? "Villa"); return; }
    if (emailMode) { router.push("/bokhald/skraning/postholf"); router.refresh(); return; }
    setOk(d.invoiceNumber); nyDagbok(); router.refresh();
  }

  async function reject() {
    if (!emailId) return;
    setBusy(true); setError("");
    const r = await fetch(`/api/skraning/email/${emailId}/reject`, { method: "POST" });
    setBusy(false);
    if (!r.ok) { const d = await r.json().catch(() => ({})); setError(d.error ?? "Villa"); return; }
    router.push("/bokhald/skraning/postholf"); router.refresh();
  }

  function onGridKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement;
    if (e.key === "Enter" && t.hasAttribute("data-cell")) {
      e.preventDefault();
      const all = Array.from(gridRef.current?.querySelectorAll<HTMLElement>("[data-cell]") ?? []);
      const i = all.indexOf(t);
      if (i === all.length - 1) { addLine(); setTimeout(() => { const next = gridRef.current?.querySelectorAll<HTMLElement>("[data-cell]"); next?.[next.length - 8]?.focus(); }, 0); }
      else all[i + 1]?.focus();
    } else if (e.key === "Backspace" && e.ctrlKey) {
      const row = t.getAttribute("data-row");
      if (row != null) { e.preventDefault(); removeLine(Number(row)); }
    }
  }

  const btn = "px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-1.5";

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-sm"><span className="text-gray-500">Drög:</span><span className="font-medium">{lines[0]?.date || fmt(todayISO())}</span></div>
        {emailMode ? (
          <a href="/bokhald/skraning/postholf" className={btn}>← Til baka í pósthólf</a>
        ) : (
          <>
            <button onClick={() => { setModalErr(""); setShowRead(true); }} className={btn}>📄 Lesa skjal</button>
            <button onClick={nyDagbok} className={`${btn} text-red-700 border-red-200`}>+ Ný dagbók</button>
            <button onClick={hreinsaLinur} className={`${btn} text-gray-600`}>🗑 Eyða drögum</button>
          </>
        )}
        {readMsg && <span className="text-xs text-green-700">{readMsg}</span>}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={hreinsaLinur} className={btn}>🧹 Hreinsa línur</button>
        <button onClick={addLine} className={btn}>+ Ný lína</button>
      </div>

      {emailMode && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Birgir (lánadrottinn)</label>
          <SupplierPicker suggestName={supplierName} suggestKennitala={supplierKennitala} onChange={(id) => setSupplierId(id)} />
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Heiti dagbókar</label>
        <input value={heiti} onChange={(e) => setHeiti(e.target.value)} placeholder="t.d. Handfærður vsk í tolli mar-apr 2025"
          className="w-full max-w-2xl border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
      </div>

      {/* Grid */}
      <div ref={gridRef} onKeyDown={onGridKeyDown} className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Dags</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Tegund</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Lykill/Aðili</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Skjalanúmer</th>
              <th className="px-2 py-2 font-semibold border-b border-gray-200 w-8"></th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200">Lýsing</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200 w-24">VSK%</th>
              <th className="px-3 py-2 font-semibold border-b border-gray-200 text-right w-32">Upphæð</th>
              <th className="border-b border-gray-200 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const amt = Number(l.amount) || 0;
              return (
                <tr key={i} className="border-b border-gray-100">
                  <td className="border-r border-gray-100 w-28">
                    <input data-cell data-row={i} value={l.date} className={`${cell} font-mono text-xs`}
                      onChange={(e) => setLine(i, "date", e.target.value)}
                      onKeyDown={(e) => { if (e.key.toLowerCase() === "d") { e.preventDefault(); setLine(i, "date", fmt(todayISO())); } }}
                      onBlur={(e) => { const iso = toISO(e.target.value); if (iso) setLine(i, "date", fmt(iso)); }} />
                  </td>
                  <td className="border-r border-gray-100 w-32">
                    <select data-cell data-row={i} value={l.type} onChange={(e) => setLine(i, "type", e.target.value)} className={`${cell} appearance-none`}><option>Fjárhagur</option></select>
                  </td>
                  <td className="border-r border-gray-100 min-w-[16rem]">
                    <input data-cell data-row={i} list="sk-accts" value={l.acctText} placeholder="Lykill eða heiti…" onChange={(e) => setLine(i, "acctText", e.target.value)} className={cell} />
                  </td>
                  <td className="border-r border-gray-100 w-24 px-3 py-1.5 font-mono text-xs text-green-700">{skjalanr}</td>
                  <td className="border-r border-gray-100 text-center">
                    {l.hasDoc && docUrl ? <a href={docUrl} target="_blank" rel="noopener" title="Sjá skjal" className="text-red-600 hover:text-red-700">📄</a> : <span className="text-gray-200">📄</span>}
                  </td>
                  <td className="border-r border-gray-100 min-w-[12rem]">
                    <input data-cell data-row={i} value={l.description} placeholder="Lýsing" onChange={(e) => setLine(i, "description", e.target.value)} className={cell} />
                  </td>
                  <td className="border-r border-gray-100 w-24">
                    <select data-cell data-row={i} value={l.vat} onChange={(e) => setLine(i, "vat", e.target.value)} className={`${cell} appearance-none`}>
                      <option value="">--</option><option value="24">24%</option><option value="11">11%</option><option value="0">0%</option>
                    </select>
                  </td>
                  <td className="border-r border-gray-100 w-32">
                    <input data-cell data-row={i} value={l.amount} inputMode="numeric" onChange={(e) => setLine(i, "amount", e.target.value.replace(/[^\d-]/g, ""))} className={`${cell} text-right font-medium ${amt < 0 ? "text-red-600" : ""}`} />
                  </td>
                  <td className="text-center"><button onClick={() => removeLine(i)} className="text-gray-300 hover:text-red-600 px-1" title="Eyða línu">×</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="sk-accts">{accounts.map((a) => <option key={a.account_number} value={`${a.account_number} — ${a.name}`} />)}</datalist>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-mono flex flex-wrap gap-x-8 gap-y-1">
        <span>Debet: <b>{kr(debet).replace(" kr.", "")}</b></span>
        <span>Kredit: <b>{kr(kredit).replace(" kr.", "")}</b></span>
        <span>Mismunur: <b className={balanced ? "text-green-700" : "text-red-600"}>{kr(diff).replace(" kr.", "")}</b>
          <span className={`ml-1 ${balanced ? "text-green-700" : "text-gray-400"}`}>({balanced ? "í jafnvægi" : "ekki í jafnvægi"})</span></span>
      </div>

      <p className="text-xs text-gray-400">
        Flæði: Enter → næsti dálkur, á enda → næsta lína. Ctrl+Backspace eyðir línu. &apos;D&apos; í dagsetningu setur daginn í dag.
        Dagsetningar: ddmmyy / ddmmyyyy / yyyymmdd. Mínus tákn (−) í upphæð skiptir á milli debet og kredit.
      </p>

      <div className="flex items-center gap-4">
        <button onClick={post} disabled={busy || !balanced} className="px-5 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40">{busy ? "Skrái…" : emailMode ? "Samþykkja og bóka" : "Skrá færslu"}</button>
        {emailMode && <button onClick={reject} disabled={busy} className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium hover:bg-gray-50 disabled:opacity-40">Hafna</button>}
        {ok && <span className="text-sm text-green-700">Skráð: {ok}</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      {/* Lesa skjal í dagbók — prompt window */}
      {showRead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !working && setShowRead(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-bold">Lesa skjal í dagbók</h3>
              <button onClick={() => !working && setShowRead(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <label className="block text-sm font-semibold text-gray-700 mb-1">Leiðbeiningar fyrir gervigreind</label>
            <select value="" onChange={(e) => { if (e.target.value) setInstructions(e.target.value); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2 bg-white outline-none focus:border-red-400">
              <option value="">Veldu vistað eða nýlegt prompt…</option>
              {recents.map((r, i) => <option key={i} value={r}>{r.length > 80 ? r.slice(0, 80) + "…" : r}</option>)}
            </select>
            <div className="relative mb-4">
              <textarea value={instructions} onChange={(e) => setInstructions(e.target.value.slice(0, 1000))} rows={3}
                placeholder={'T.d. "Þetta eru innkaupareikningar frá Origo, bóka á lykil 6010 (skrifstofukostnaður) og VSK á 4310"'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-y" />
              <span className="absolute bottom-2 right-3 text-xs text-gray-400">{instructions.length} / 1000</span>
            </div>

            <div onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
              className={`border-2 border-dashed rounded-xl px-6 py-10 text-center cursor-pointer transition-colors ${dragOver ? "border-red-400 bg-red-50/50" : "border-gray-300 hover:bg-gray-50"}`}>
              <input ref={fileRef} type="file" multiple accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,.xlsx,.xls,.csv" className="hidden"
                onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }} />
              <div className="text-3xl mb-2">📥</div>
              <p className="font-semibold text-gray-700">Smelltu eða dragðu skjöl hingað</p>
              <p className="text-sm text-gray-500 mt-1">Styður PDF, myndir (JPG, PNG, WebP) og Excel skjöl — allt að 10 skjöl í einu</p>
              <p className="text-sm text-gray-400">Hámarksstærð: 10 MB per skjal</p>
            </div>

            {files.length > 0 && (
              <div className="mt-3 space-y-1">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                    <span className="truncate">{f.name} <span className="text-gray-400">· {fileSize(f.size)}</span></span>
                    <button onClick={() => setFiles((p) => p.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-600 ml-2">×</button>
                  </div>
                ))}
              </div>
            )}

            {modalErr && <p className="text-sm text-red-600 mt-3">{modalErr}</p>}

            <div className="flex items-center justify-end gap-3 mt-5">
              <button onClick={() => !working && setShowRead(false)} disabled={!!working} className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50">Hætta við</button>
              <button onClick={vinnaSkjal} disabled={!files.length || !!working} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 flex items-center gap-2">
                📄 {working || "Vinna skjal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
