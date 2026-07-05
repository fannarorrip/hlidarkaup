"use client";
// Launareiknivél — interactive gross→net + employer-cost calculator (flýtireiknir, ekkert bókað).
// Styled to mirror Regla's reiknivél (regla.is/is/reiknivel). The core gross→net math matches
// lib/payroll.ts calcLine; employer cost adds the Icelandic refinements Regla shows: tryggingagjald
// is levied on brúttó + mótframlag launagreiðanda í lífeyrissjóð, and the cost bar splits tax into
// ríkissjóður / sveitarfélag (útsvar). Runs entirely client-side off the statutory rates from config.
import { useMemo, useState } from "react";

export interface Cfg {
  year: number;
  personal_credit_monthly: number;
  bracket1_limit: number; bracket1_rate: number;
  bracket2_limit: number; bracket2_rate: number;
  bracket3_rate: number;
  tryggingagjald_rate: number;
}
interface Union { id: string; name: string }
interface Fund { union_id: string; payer: "employee" | "employer"; fund_type: string; rate_pct: number }

// Hlíðarkaup Eldhús palette (app/eldhus/theme.ts): deep teal-blue + teal accents + red CTA on warm white.
const DARK = "#2C687B", PALE = "#E4F1F0", PALEBORDER = "#8CC7C4", BADGE = "#4A8499", GREENVAL = "#2C687B";
const LIGHTLABEL = "#8CC7C4", INK = "#21323A", MUTEDVAL = "#9DB0B6";
const UTSVAR_RATE = 14.97; // meðalútsvar — only used to split the cost bar into ríki/sveitarfélag (myndræn skipting).

const round = (n: number) => Math.round(n);
const g = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const pn = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0; // parse "11,50" / "850.000"
const fmtPct = (n: number) => n.toLocaleString("is-IS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Reiknivel({ cfg, unions, funds }: { cfg: Cfg; unions: Union[]; funds: Fund[] }) {
  const [gross, setGross] = useState(850000);
  const [other, setOther] = useState(0);
  const [ratio, setRatio] = useState("100");
  const [unionId, setUnionId] = useState("");
  const [unionFixed, setUnionFixed] = useState("");
  const [p, setP] = useState({
    pensionEe: "4,00", privateEe: "0,00", personal: "100",
    pensionEr: "11,50", endurhaefing: "0,10", privateEr: "0,00",
    unionEe: "0,00", otherFees: "0,00",
    sjukra: "0,00", orlof: "0,00", starfsmennt: "0,00", adrir: "0,00",
  });
  const set = (k: keyof typeof p, v: string) => setP((s) => ({ ...s, [k]: v }));

  function pickUnion(id: string) {
    setUnionId(id);
    const fs = funds.filter((f) => f.union_id === id);
    const sum = (test: (f: Fund) => boolean) => fs.filter(test).reduce((a, f) => a + f.rate_pct, 0);
    const ft = (f: Fund, ...keys: string[]) => keys.some((k) => f.fund_type.includes(k));
    if (!id) { setP((s) => ({ ...s, unionEe: "0,00", sjukra: "0,00", orlof: "0,00", starfsmennt: "0,00", adrir: "0,00" })); return; }
    setP((s) => ({
      ...s,
      unionEe: fmtPct(sum((f) => f.payer === "employee")),
      sjukra: fmtPct(sum((f) => f.payer === "employer" && ft(f, "sjukra"))),
      orlof: fmtPct(sum((f) => f.payer === "employer" && ft(f, "orlof"))),
      starfsmennt: fmtPct(sum((f) => f.payer === "employer" && ft(f, "starfsmennt", "mennt"))),
      adrir: fmtPct(sum((f) => f.payer === "employer" && !ft(f, "sjukra", "orlof", "starfsmennt", "mennt"))),
    }));
  }

  const c = useMemo(() => {
    const rt = pn(ratio) / 100;
    const salary = round(gross * rt);
    const grossTotal = salary + other;
    const pensionEe = round(salary * pn(p.pensionEe) / 100);
    const privateEe = round(salary * pn(p.privateEe) / 100);
    const lifeyrirEe = pensionEe + privateEe;
    const taxable = Math.max(0, grossTotal - pensionEe - privateEe);

    const b1 = round(Math.min(taxable, cfg.bracket1_limit) * cfg.bracket1_rate / 100);
    const b2 = taxable > cfg.bracket1_limit ? round((Math.min(taxable, cfg.bracket2_limit) - cfg.bracket1_limit) * cfg.bracket2_rate / 100) : 0;
    const b3 = taxable > cfg.bracket2_limit ? round((taxable - cfg.bracket2_limit) * cfg.bracket3_rate / 100) : 0;
    const bracketTotal = b1 + b2 + b3;
    const credit = round(cfg.personal_credit_monthly * pn(p.personal) / 100);
    const creditUsed = Math.min(bracketTotal, credit);
    const tax = Math.max(0, bracketTotal - creditUsed);

    const unionEe = round(grossTotal * pn(p.unionEe) / 100) + round(pn(unionFixed)) + round(grossTotal * pn(p.otherFees) / 100);
    const net = grossTotal - pensionEe - privateEe - tax - unionEe;

    const pensionEr = round(salary * pn(p.pensionEr) / 100);
    const endurhaefing = round(salary * pn(p.endurhaefing) / 100);
    const privateEr = round(salary * pn(p.privateEr) / 100);
    const employerPension = pensionEr + endurhaefing + privateEr;
    const tg = round((grossTotal + pensionEr + privateEr) * cfg.tryggingagjald_rate / 100);
    const unionEr = round(grossTotal * (pn(p.sjukra) + pn(p.orlof) + pn(p.starfsmennt) + pn(p.adrir)) / 100);

    const employerTotal = employerPension + tg + unionEr;
    const totalCost = grossTotal + employerTotal;

    // Cost-bar split (illustrative): tax → útsvar (sveitarfélag) + ríkishluti; ríkissjóður also gets tryggingagjald.
    const utsvar = Math.min(tax, round(taxable * UTSVAR_RATE / 100));
    const rikissjodur = Math.max(0, tax - utsvar) + tg;

    return {
      salary, grossTotal, pensionEe, privateEe, lifeyrirEe, taxable, b1, b2, b3, credit, creditUsed, tax,
      unionEe, net, pensionEr, endurhaefing, privateEr, employerPension, tg, unionEr, employerTotal, totalCost,
      utsvar, rikissjodur, taxPct: grossTotal ? tax / grossTotal * 100 : 0, markup: grossTotal ? employerTotal / grossTotal * 100 : 0,
    };
  }, [gross, other, ratio, unionFixed, p, cfg]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: DARK }}>Launareiknivél</h1>
        <p className="text-sm text-gray-500 mt-1">Reiknaðu nettólaun þín og heildarkostnað vinnuveitanda — flýtireiknir, engar færslur bókaðar.</p>
      </div>

      {/* ===== Top row: input + two summary cards ===== */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Input */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Mánaðarlaun</label>
              <AmountInput value={gross} onChange={setGross} />
            </div>
            <div className="w-24">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Starfshlutfall</label>
              <div className="relative">
                <input value={ratio} onChange={(e) => setRatio(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-lg font-semibold text-center outline-none focus:border-[#2c687b]" />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </div>
          </div>
          <div>
            <input type="range" min={300000} max={3000000} step={10000} value={Math.min(3000000, Math.max(300000, gross))}
              onChange={(e) => setGross(Number(e.target.value))} className="w-full accent-[#DB1A1A]" />
            <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>300.000 kr.</span><span>3.000.000 kr.</span></div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Önnur laun</label>
            <p className="text-xs text-gray-400 mb-1">t.d. bifreiðastyrkur — ekki lífeyrisgrundvöllur</p>
            <AmountInput value={other} onChange={setOther} />
          </div>
        </div>

        {/* Útborguð laun */}
        <div className="rounded-2xl p-5" style={{ background: PALE, border: `2px solid ${PALEBORDER}` }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: GREENVAL }}>Útborguð laun á mánuði</p>
          <p className="text-4xl font-bold mt-1" style={{ color: DARK }}>{g(c.net)} kr.</p>
          <p className="text-xs text-gray-500 mt-1">Skatthlutfall: {c.taxPct.toFixed(1).replace(".", ",")}%</p>
          <div className="border-t my-3" style={{ borderColor: PALEBORDER }} />
          <SumRow label="Brúttólaun" value={c.grossTotal} />
          <SumRow label="Skattur" value={c.tax} />
          <SumRow label="Lífeyrir" value={c.lifeyrirEe} />
          <SumRow label="Stéttarfélag" value={c.unionEe} />
          <div className="mt-3">
            <Bar segs={[
              { label: "Nettólaun", value: c.net, color: DARK },
              { label: "Skattur", value: c.tax, color: "#5C6B72" },
              { label: "Lífeyrir", value: c.lifeyrirEe, color: "#8CC7C4" },
              { label: "Stéttarfélag", value: c.unionEe, color: "#B9DEDB" },
            ]} />
          </div>
        </div>

        {/* Heildarkostnaður */}
        <div className="rounded-2xl p-5 text-white" style={{ background: DARK }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: LIGHTLABEL }}>Heildarkostnaður á mánuði</p>
          <p className="text-4xl font-bold mt-1">{g(c.totalCost)} kr.</p>
          <p className="text-xs mt-1" style={{ color: LIGHTLABEL }}>{c.markup.toFixed(1).replace(".", ",")}% ofan á brúttólaun</p>
          <div className="border-t my-3 border-white/15" />
          <SumRow label="Brúttólaun" value={c.grossTotal} dark />
          <SumRow label="Lífeyrissjóður" value={c.employerPension} dark />
          <SumRow label="Tryggingagjald" value={c.tg} dark />
          <SumRow label="Stéttarfélag" value={c.unionEr} dark />
          <div className="mt-3">
            <Bar dark segs={[
              { label: "Nettólaun", value: c.net, color: "#E4F1F0" },
              { label: "Ríkissjóður", value: c.rikissjodur, color: "#8CC7C4" },
              { label: "Sveitarfélag", value: c.utsvar, color: "#B9DEDB" },
              { label: "Lífeyrissjóður", value: c.lifeyrirEe + c.employerPension, color: "#6FA8B5" },
              { label: "Stéttarfélag", value: c.unionEe + c.unionEr, color: "#EF8A8A" },
            ]} />
          </div>
        </div>
      </div>

      {/* ===== Bottom row: detail cards ===== */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* 1 — Lífeyrissjóður */}
        <Card n={1} title="Lífeyrissjóður" empFooter={-c.lifeyrirEe} erFooter={c.employerPension}>
          <ColHead />
          <SubHead>Starfsmaður</SubHead>
          <Pct label="Iðgjald í lífeyrissjóð" pct={p.pensionEe} onPct={(v) => set("pensionEe", v)} value={-c.pensionEe} />
          <Pct label="Séreignarsparnaður" pct={p.privateEe} onPct={(v) => set("privateEe", v)} value={-c.privateEe} />
          <SubHead>Vinnuveitandi</SubHead>
          <Pct label="Mótframlag í lífeyrissjóð" pct={p.pensionEr} onPct={(v) => set("pensionEr", v)} value={c.pensionEr} />
          <Pct label="Endurhæfingarsjóður" pct={p.endurhaefing} onPct={(v) => set("endurhaefing", v)} value={c.endurhaefing} />
          <Pct label="Séreignarframlag" pct={p.privateEr} onPct={(v) => set("privateEr", v)} value={c.privateEr} />
        </Card>

        {/* 2 — Opinber gjöld */}
        <Card n={2} title="Opinber gjöld" empFooter={-c.tax} erFooter={c.tg}>
          <ColHead />
          <SubHead>Starfsmaður</SubHead>
          <Pct label="Tekjuskattur þrep 1" pct={fmtPct(cfg.bracket1_rate)} fixed value={-c.b1} />
          <Pct label="Tekjuskattur þrep 2" pct={fmtPct(cfg.bracket2_rate)} fixed value={-c.b2} />
          <Pct label="Tekjuskattur þrep 3" pct={fmtPct(cfg.bracket3_rate)} fixed value={-c.b3} />
          <Pct label="Persónuafsláttur" pct={p.personal} onPct={(v) => set("personal", v)} value={c.creditUsed} sub={`= ${g(c.credit)} kr.`} />
          <SubHead>Vinnuveitandi</SubHead>
          <Pct label="Tryggingagjald" pct={fmtPct(cfg.tryggingagjald_rate)} fixed value={c.tg} />
        </Card>

        {/* 3 — Stéttarfélög og sjóðir */}
        <Card n={3} title="Stéttarfélög og sjóðir" empFooter={c.unionEe ? -c.unionEe : 0} erFooter={c.unionEr}>
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Stéttarfélag</label>
          <select value={unionId} onChange={(e) => pickUnion(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#2c687b] mb-3" style={{ background: PALE }}>
            <option value="">Ekkert</option>
            {unions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <ColHead />
          <SubHead>Starfsmaður</SubHead>
          <Pct label="Stéttarfélagsgjald" pct={p.unionEe} onPct={(v) => set("unionEe", v)}
            value={c.unionEe} extra={<input value={unionFixed} onChange={(e) => setUnionFixed(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="kr." inputMode="numeric" className="w-16 border border-gray-300 rounded-md px-2 py-1 text-sm text-right outline-none focus:border-[#2c687b]" />} />
          <Pct label="Önnur gjöld" pct={p.otherFees} onPct={(v) => set("otherFees", v)} value={-round(c.grossTotal * pn(p.otherFees) / 100)} />
          <SubHead>Vinnuveitandi</SubHead>
          <Pct label="Sjúkrasjóður" pct={p.sjukra} onPct={(v) => set("sjukra", v)} value={round(c.grossTotal * pn(p.sjukra) / 100)} />
          <Pct label="Orlofssjóður" pct={p.orlof} onPct={(v) => set("orlof", v)} value={round(c.grossTotal * pn(p.orlof) / 100)} />
          <Pct label="Starfsmenntasjóður" pct={p.starfsmennt} onPct={(v) => set("starfsmennt", v)} value={round(c.grossTotal * pn(p.starfsmennt) / 100)} />
          <Pct label="Aðrir sjóðir" pct={p.adrir} onPct={(v) => set("adrir", v)} value={round(c.grossTotal * pn(p.adrir) / 100)} />
        </Card>
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        Forsendur skattársins {cfg.year}: persónuafsláttur {g(cfg.personal_credit_monthly)} kr./mán · staðgreiðsla {fmtPct(cfg.bracket1_rate)}% / {fmtPct(cfg.bracket2_rate)}% / {fmtPct(cfg.bracket3_rate)}% · tryggingagjald {fmtPct(cfg.tryggingagjald_rate)}% (reiknað á brúttólaun + mótframlag í lífeyrissjóð). Skipting í ríkissjóð/sveitarfélag í súluriti er áætluð (meðalútsvar {fmtPct(UTSVAR_RATE)}%). Ónýttur persónuafsláttur færist ekki milli mánaða.
      </p>
    </div>
  );
}

/* ---------- pieces ---------- */

function AmountInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="relative">
      <input value={g(value)} onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} inputMode="numeric"
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-lg font-semibold outline-none focus:border-[#2c687b] pr-10" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">kr.</span>
    </div>
  );
}

function SumRow({ label, value, dark }: { label: string; value: number; dark?: boolean }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className={dark ? "text-white/75" : "text-gray-600"}>{label}</span>
      <span className={`tabular-nums font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{value ? `${g(value)} kr.` : "—"}</span>
    </div>
  );
}

function Bar({ segs, dark }: { segs: { label: string; value: number; color: string }[]; dark?: boolean }) {
  const total = segs.reduce((a, s) => a + Math.max(0, s.value), 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5" style={{ background: dark ? "rgba(255,255,255,.12)" : "#E4F1F0" }}>
        {segs.map((s, i) => s.value > 0 && <div key={i} style={{ width: `${s.value / total * 100}%`, background: s.color }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px]">
        {segs.map((s, i) => (
          <span key={i} className={`inline-flex items-center gap-1 ${dark ? "text-white/70" : "text-gray-500"}`}>
            <span className="w-2 h-2 rounded-sm" style={{ background: s.color }} />
            {s.label} <b className={dark ? "text-white" : "text-gray-700"}>{(s.value / total * 100).toFixed(1).replace(".", ",")}%</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function Card({ n, title, empFooter, erFooter, children }: { n: number; title: string; empFooter: number; erFooter: number; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2.5 px-5 py-3" style={{ background: DARK }}>
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: BADGE }}>{n}</span>
        <span className="text-white font-semibold text-sm">{title}</span>
      </div>
      <div className="p-5 flex-1">{children}</div>
      <div className="grid grid-cols-2 border-t border-gray-100">
        <div className="px-4 py-3 text-center" style={{ background: PALE }}>
          <p className="text-[11px] text-gray-500">Starfsmaður</p>
          <p className="font-bold tabular-nums" style={{ color: DARK }}>{empFooter ? `−${g(-empFooter)} kr.` : "—"}</p>
        </div>
        <div className="px-4 py-3 text-center text-white" style={{ background: DARK }}>
          <p className="text-[11px] text-white/70">Vinnuveitandi</p>
          <p className="font-bold tabular-nums">{erFooter ? `+${g(erFooter)} kr.` : "—"}</p>
        </div>
      </div>
    </div>
  );
}

const ColHead = () => (
  <div className="flex items-center text-[11px] text-gray-400 font-medium pb-1">
    <span className="flex-1" /><span className="w-16 text-center">%</span><span className="w-28 text-right">kr./mán.</span>
  </div>
);
const SubHead = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mt-3 mb-1">{children}</p>
);

function Pct({ label, pct, onPct, fixed, value, sub, extra }:
  { label: string; pct: string; onPct?: (v: string) => void; fixed?: boolean; value: number; sub?: string; extra?: React.ReactNode }) {
  const cls = `w-16 text-center border rounded-md px-2 py-1 text-sm tabular-nums outline-none ${fixed ? "bg-gray-50 text-gray-400 border-gray-200" : "border-gray-300 focus:border-[#2c687b]"}`;
  return (
    <div className="py-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm text-gray-600">{label}</span>
        {extra}
        <input value={pct} readOnly={fixed} onChange={onPct ? (e) => onPct(e.target.value.replace(/[^\d.,]/g, "")) : undefined} inputMode="decimal" className={cls} />
        <span className="w-28 text-right text-sm tabular-nums" style={{ color: value > 0 ? GREENVAL : value < 0 ? INK : MUTEDVAL }}>
          {value === 0 ? "—" : value > 0 ? `+${g(value)} kr.` : `−${g(-value)} kr.`}
        </span>
      </div>
      {sub && <p className="text-[11px] text-gray-400 text-right pr-[120px]">{sub}</p>}
    </div>
  );
}
