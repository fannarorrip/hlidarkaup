// Hjálpari — agentic in-app assistant (Claude with tools): answers questions, LOOKS THINGS UP
// (vörur, sala, fjármál, áminningar) and NAVIGATES the user to the right page.
// All tools are READ-ONLY — the assistant never books, sends or changes anything.
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { getReminders } from "@/lib/reminders";
import { STORE } from "@/lib/store";

export function assistantEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface ChatTurn { role: "user" | "assistant"; content: string }
export interface ChatResult { ok: boolean; reply?: string; navigate?: string; error?: string }

// ── Navigation whitelist ─────────────────────────────────────────────────────
const PAGES: Record<string, string> = {
  "/bokhald": "Yfirlit — sala dagsins, áminningar, gröf",
  "/bokhald/dagatal": "Dagatal & áminningar — skiladagar skatta, ritúöl, eigin áminningar",
  "/bokhald/lyklar": "Bókhaldslyklar",
  "/bokhald/fylgiskjol": "Fylgiskjöl (öll bókuð skjöl)",
  "/bokhald/skraning": "Skráning — bóka fylgiskjöl (líka með AI-lestri á PDF)",
  "/bokhald/skraning/postholf": "Pósthólf — mótteknir reikningar sem bíða bókunar",
  "/bokhald/adalbok": "Aðalbók",
  "/bokhald/hreyfingar": "Hreyfingar bókhaldslykla",
  "/bokhald/profjofnudur": "Prófjöfnuður",
  "/bokhald/rekstur": "Rekstrarreikningur (P&L)",
  "/bokhald/efnahagur": "Efnahagsreikningur",
  "/bokhald/arsreikningur": "Ársreikningur",
  "/bokhald/vsk": "VSK uppgjör",
  "/bokhald/afstemming": "Afstemming (banki, lánadrottnar o.fl.)",
  "/bokhald/stada-vidskiptamanna": "Staða viðskiptamanna",
  "/bokhald/vidskiptamannalisti": "Viðskiptamannalisti",
  "/bokhald/bankatenging": "Bankatengingar — kröfur, ógreiddir reikningar, bankayfirlit, kort",
  "/bokhald/solukerfi/birgjar": "Lánadrottnar (birgjar)",
  "/bokhald/solukerfi/reikningar": "Sölureikningar",
  "/bokhald/solukerfi/vidskiptamenn": "Viðskiptamenn (reikningsviðskipti)",
  "/bokhald/solukerfi/vorur": "Vörur — vörugrunnur, verð, birgðir",
  "/bokhald/solukerfi/voruflokkar": "Vöruflokkar",
  "/bokhald/solukerfi/manaduppgjor": "Mánaðaruppgjör reikningsviðskipta",
  "/bokhald/solukerfi/kassauppgjor": "Kassauppgjör / Z-skýrslur",
  "/bokhald/solukerfi/krofur": "Kröfulisti (kröfur sem VIÐ sendum)",
  "/bokhald/solukerfi/innkaup": "Innkaupareikningar",
  "/bokhald/solukerfi/innkaupapantanir": "Innkaupapantanir — Í dag pantast + pöntunarsniðmát",
  "/bokhald/solukerfi/innkaup/mottaka": "Móttaka vöru + verðbreytingatillögur",
  "/bokhald/solukerfi/skil-til-birgja": "Skil til birgja",
  "/bokhald/solukerfi/afskriftir": "Afskriftir — skanna vöru sem er hent + kreditlisti birgja",
  "/bokhald/solukerfi/kaelar": "Kælaaflestur (HACCP hitastigsskráning)",
  "/bokhald/solukerfi/birgdaskyrsla": "Birgðaskýrsla",
  "/bokhald/laun": "Laun — launakeyrslur",
  "/bokhald/laun/launthegar": "Launþegar",
  "/bokhald/laun/skilagrein": "Skilagrein staðgreiðslu",
  "/bokhald/starfsmenn": "Starfsmenn og aðgangar",
};

// ── Tools ────────────────────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: "opna_sidu",
    description: "Opnar síðu í kerfinu fyrir notandann (leiðsögn). Notaðu þegar notandinn biður um að fara eitthvert, opna eitthvað, eða spyr 'hvar geri ég X'. Veldu réttu síðuna úr listanum.",
    input_schema: {
      type: "object",
      properties: { path: { type: "string", enum: Object.keys(PAGES), description: Object.entries(PAGES).map(([p, d]) => `${p} = ${d}`).join("; ") } },
      required: ["path"],
    },
  },
  {
    name: "leita_voru",
    description: "Leitar í vörugrunninum eftir vöruheiti, PLU-númeri eða strikamerki. Skilar verði, kostnaðarverði, birgðastöðu og birgi.",
    input_schema: { type: "object", properties: { q: { type: "string", description: "leitarorð, PLU eða strikamerki" } }, required: ["q"] },
  },
  {
    name: "fjarmal_stada",
    description: "Staða fjármála: ógreiddar kröfur á okkur (bankareikningar með eindaga), gjaldfallnir lánadrottnareikningar, og útistandandi kröfur sem við höfum sent viðskiptavinum.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "aminningar",
    description: "Áminningalistinn: hvað þarf að muna/gera — óbókuð fylgiskjöl, skiladagar skatta (VSK, staðgreiðsla, lífeyrir), gjaldfallnir reikningar, kælaaflestur, ritúöl.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sala",
    description: "Sölutölur (nettó tekjur án VSK og fjöldi sölufylgiskjala) fyrir tímabil.",
    input_schema: {
      type: "object",
      properties: { timabil: { type: "string", enum: ["i_dag", "i_gaer", "sidustu_7_daga", "thessi_manudur"], description: "tímabilið" } },
      required: ["timabil"],
    },
  },
];

const SALE_TYPES = ["kassi_sale", "sales_invoice", "credit_note", "web_sale", "account_sale", "eldhus_sale"];

async function runTool(name: string, input: Record<string, unknown>, nav: { path: string | null }): Promise<string> {
  try {
    if (name === "opna_sidu") {
      const path = String(input.path || "");
      if (!PAGES[path]) return JSON.stringify({ error: "Óþekkt síða — veldu úr listanum." });
      nav.path = path;
      return JSON.stringify({ ok: true, opnad: path, um: PAGES[path] });
    }

    if (name === "leita_voru") {
      const q = String(input.q || "").trim();
      if (q.length < 2) return JSON.stringify({ error: "of stutt leitarorð" });
      const digits = q.replace(/\D/g, "");
      let rows: unknown[] = [];
      if (digits.length >= 8 && digits === q) {
        const variants = [digits];
        if (/^\d{12}$/.test(digits)) variants.push("0" + digits);
        if (/^0\d{12}$/.test(digits)) variants.push(digits.slice(1));
        rows = await query(
          `select p.product_number, p.name, p.price_gross as verd, p.cost_price::float8 as kostnadarverd,
                  p.stock_quantity::float8 as birgdir, s.name as birgir
             from shop.product_barcodes b
             join shop.products p on p.product_number = b.product_number
             left join acc.suppliers s on s.id = p.preferred_supplier_id
            where b.barcode = any($1) limit 5`, [variants]);
      }
      if (!rows.length) {
        rows = await query(
          `select p.product_number, p.name, p.price_gross as verd, p.cost_price::float8 as kostnadarverd,
                  p.stock_quantity::float8 as birgdir, s.name as birgir
             from shop.products p
             left join acc.suppliers s on s.id = p.preferred_supplier_id
            where p.is_active and (p.name ilike $1 or p.product_number = $2)
            order by p.name limit 8`, ["%" + q + "%", q]);
      }
      return JSON.stringify(rows.length ? { vorur: rows } : { nidurstada: "ekkert fannst" });
    }

    if (name === "fjarmal_stada") {
      const [bills, payables, ourClaims] = await Promise.all([
        query<{ n: string; sum: string }>(`select count(*)::text as n, coalesce(sum(amount_due),0)::text as sum from acc.bank_bills where status='open'`),
        query<{ n: string; sum: string; overdue: string }>(
          `select count(*)::text as n, coalesce(sum(amount),0)::text as sum,
                  count(*) filter (where due_date < current_date)::text as overdue
             from acc.payables where status in ('open','pending')`),
        query<{ n: string; sum: string }>(`select count(*)::text as n, coalesce(sum(amount),0)::text as sum from acc.claims where status in ('queued','sending','created')`),
      ]);
      const topBills = await query(
        `select coalesce(claimant_name, claimant_id) as krofuhafi, amount_due::float8 as upphaed,
                coalesce(final_due_date, due_date)::text as eindagi
           from acc.bank_bills where status='open' order by coalesce(final_due_date, due_date) limit 6`);
      return JSON.stringify({
        krofur_a_okkur_i_banka: { fjoldi: Number(bills[0].n), samtals_kr: Number(bills[0].sum), listi: topBills },
        lanadrottnar_ogreiddir: { fjoldi: Number(payables[0].n), samtals_kr: Number(payables[0].sum), gjaldfallnir: Number(payables[0].overdue) },
        utistandandi_krofur_fra_okkur: { fjoldi: Number(ourClaims[0].n), samtals_kr: Number(ourClaims[0].sum) },
      });
    }

    if (name === "aminningar") {
      const items = await getReminders(14);
      if (!items.length) return JSON.stringify({ nidurstada: "ekkert áríðandi" });
      return JSON.stringify({
        aminningar: items.slice(0, 15).map((r) => ({
          titill: r.title, hvenaer: r.dueDate, dagar: r.daysUntil, staða: r.severity, nanari: r.detail, sida: r.href,
        })),
      });
    }

    if (name === "sala") {
      const t = String(input.timabil || "i_dag");
      const range =
        t === "i_gaer" ? ["current_date - 1", "current_date - 1"]
        : t === "sidustu_7_daga" ? ["current_date - 6", "current_date"]
        : t === "thessi_manudur" ? ["date_trunc('month', current_date)::date", "current_date"]
        : ["current_date", "current_date"];
      const r = (await query<{ net: string; tx: string }>(
        `select coalesce(sum(le.credit - le.debit) filter (where a.account_type = 'tekjur'), 0)::text as net,
                count(distinct v.id)::text as tx
           from acc.vouchers v
           join acc.ledger_entries le on le.voucher_id = v.id
           join acc.accounts a on a.account_number = le.account_number
          where v.status = 'posted' and v.voucher_type = any($1)
            and v.voucher_date between ${range[0]} and ${range[1]}`, [SALE_TYPES]))[0];
      return JSON.stringify({ timabil: t, netto_tekjur_an_vsk_kr: Math.round(Number(r.net)), fjoldi_solufylgiskjala: Number(r.tx) });
    }

    return JSON.stringify({ error: "óþekkt tól" });
  } catch (e) {
    console.error(`assistant tool ${name} failed:`, e);
    return JSON.stringify({ error: "tólið brást — reyndu annað eða svaraðu án þess" });
  }
}

// ── Chat loop ────────────────────────────────────────────────────────────────
const SYSTEM =
  `Þú ert hjálpari í bókhalds- og verslunarkerfi ${STORE.name} (matvöruverslun á Sauðárkróki). ` +
  `Svaraðu STUTT og skýrt á íslensku (nema notandinn skrifi annað tungumál). ` +
  `Þú hefur TÓL: getur leitað í vörugrunni, séð sölutölur, fjármálastöðu og áminningalistann — notaðu þau í stað þess að giska, og notaðu ALDREI tölur úr minni. ` +
  `Þú getur líka OPNAÐ síður fyrir notandann með opna_sidu — gerðu það þegar hann biður um leiðsögn ("farðu með mig", "opnaðu", "hvar geri ég X") og segðu svo í einni línu hvað hann gerir þar. ` +
  `Þú framkvæmir EKKI aðgerðir (bókar ekki, sendir ekki, breytir engu) — þú leiðbeinir. ` +
  `Upphæðir: notaðu íslenskt snið (1.234 kr.). Ef þú veist ekki svarið, segðu það.`;

export async function chat(messages: ChatTurn[]): Promise<ChatResult> {
  if (!assistantEnabled()) return { ok: false, error: "ANTHROPIC_API_KEY vantar." };
  const clean = (messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") return { ok: false, error: "Engin spurning." };

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ASSISTANT_MODEL || "claude-opus-4-8";
    const convo: Anthropic.MessageParam[] = clean as Anthropic.MessageParam[];
    const nav: { path: string | null } = { path: null };

    for (let round = 0; round < 6; round++) {
      const msg = await client.messages.create({
        model, max_tokens: 1024, system: SYSTEM, tools: TOOLS, messages: convo,
      });
      if (msg.stop_reason === "tool_use") {
        convo.push({ role: "assistant", content: msg.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const block of msg.content) {
          if (block.type === "tool_use") {
            const out = await runTool(block.name, (block.input ?? {}) as Record<string, unknown>, nav);
            results.push({ type: "tool_result", tool_use_id: block.id, content: out });
          }
        }
        convo.push({ role: "user", content: results });
        continue;
      }
      const text = msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("\n").trim();
      return { ok: true, reply: text || "(ekkert svar)", navigate: nav.path ?? undefined };
    }
    return { ok: true, reply: "Þetta tók of margar umferðir — reyndu að orða spurninguna öðruvísi.", navigate: nav.path ?? undefined };
  } catch (e) {
    console.error("assistant chat failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Villa" };
  }
}
