// Renders a received PEPPOL/UBL e-invoice as a clean, human-readable HTML invoice for preview
// in the Skráning Pósthólf (instead of showing raw XML). The stored XML stays the fylgiskjal;
// this is view-only. All supplier-supplied text is HTML-escaped (untrusted source).
import { parsePeppolInvoice } from "@/lib/peppol";
import { XMLParser } from "fast-xml-parser";
import { kr, dags } from "@/lib/format";
import { STORE } from "@/lib/store";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const unit = (c: string) => {
  const u = (c || "").toUpperCase();
  return u === "H87" || u === "EA" || u === "C62" || u === "" ? "stk" : u === "KGM" ? "kg" : u === "LTR" ? "l" : c;
};

// Buyer + payment details aren't in ParsedInvoice; pull the few extra fields directly.
function extras(xml: string): { buyerName: string; iban: string; paymentId: string; note: string } {
  try {
    const p = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", removeNSPrefix: true, parseTagValue: false, trimValues: true });
    const root = p.parse(xml) as Record<string, unknown>;
    const inv = (root.Invoice ?? root.CreditNote ?? {}) as Record<string, unknown>;
    const t = (v: unknown): string => (v == null ? "" : typeof v === "object" ? String((v as Record<string, unknown>)["#text"] ?? "") : String(v));
    const buyer = ((inv.AccountingCustomerParty as Record<string, unknown>)?.Party ?? {}) as Record<string, unknown>;
    const buyerName = t((buyer.PartyName as Record<string, unknown>)?.Name) || t((buyer.PartyLegalEntity as Record<string, unknown>)?.RegistrationName) || STORE.name;
    const pmRaw = inv.PaymentMeans;
    const pm = (Array.isArray(pmRaw) ? pmRaw[0] : pmRaw ?? {}) as Record<string, unknown>;
    return {
      buyerName,
      iban: t((pm.PayeeFinancialAccount as Record<string, unknown>)?.ID),
      paymentId: t(pm.PaymentID),
      note: t(inv.Note),
    };
  } catch { return { buyerName: STORE.name, iban: "", paymentId: "", note: "" }; }
}

/** Full standalone HTML document rendering the invoice. Throws if the XML isn't a valid UBL invoice. */
export function renderInboundInvoiceHtml(xml: string): string {
  const inv = parsePeppolInvoice(xml);
  const x = extras(xml);
  const credit = inv.isCredit;   // kreditreikningur → amounts are negative, labelled distinctly

  const byRate = new Map<number, { net: number; vat: number }>();
  for (const l of inv.lines) {
    const g = byRate.get(l.vatRate) ?? { net: 0, vat: 0 };
    g.net += l.lineNet; g.vat += Math.round((l.lineNet * l.vatRate) / 100); byRate.set(l.vatRate, g);
  }
  const vatRows = [...byRate.entries()].filter(([r]) => r > 0).sort((a, b) => b[0] - a[0])
    .map(([r, g]) => `<div class="tr"><span>VSK ${r}%</span><span>${esc(kr(g.vat))}</span></div>`).join("");

  const lineRows = inv.lines.map((l) => `<tr>
      <td>${esc(l.description || "—")}${l.supplierItemId ? `<span class="dim"> · ${esc(l.supplierItemId)}</span>` : ""}</td>
      <td class="r dim">${esc(l.qty)} ${esc(unit(l.unitCode))}</td>
      <td class="r dim">${esc(kr(l.unitPrice))}</td>
      <td class="r dim">${esc(l.vatRate)}%</td>
      <td class="r b">${esc(kr(l.lineNet))}</td></tr>`).join("");

  const pay = (x.iban || x.paymentId) ? `<div class="pay"><div class="dim s">Greiðsluupplýsingar</div>
      ${x.iban ? `<div>Reikningur: <span class="mono">${esc(x.iban)}</span></div>` : ""}
      ${x.paymentId ? `<div>Kröfunúmer / tilvísun: <span class="mono">${esc(x.paymentId)}</span></div>` : ""}</div>` : "";

  return `<!doctype html><html lang="is"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reikningur ${esc(inv.invoiceNumber || "")}</title><style>
:root{--ink:#21323A;--teal:#2C687B;--b:#e5e7eb;--dim:#8a97a0}
*{box-sizing:border-box}body{margin:0;background:#f3f5f6;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;font-variant-numeric:tabular-nums}
.wrap{max-width:760px;margin:0 auto;padding:20px}
.bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.btn{border:1px solid var(--b);background:#fff;color:var(--ink);font-weight:600;font-size:14px;padding:8px 16px;border-radius:9px;cursor:pointer;text-decoration:none;display:inline-block}
.btn.p{background:var(--teal);color:#fff;border-color:var(--teal)}
.card{background:#fff;border:1px solid var(--b);border-radius:14px;padding:32px}
.head{display:flex;justify-content:space-between;gap:24px;border-bottom:1px solid var(--b);padding-bottom:18px;margin-bottom:18px}
.eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}
h1{font-size:20px;margin:2px 0 0}.big{font-size:26px;font-weight:800}
.tag{display:inline-block;margin-top:6px;font-size:11px;padding:2px 8px;border-radius:99px;background:#e7f1f2;color:var(--teal)}
.tag.credit{background:#f3e8ff;color:#7e22ce}
.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;font-size:13px;margin-bottom:22px}
.meta .dim{font-size:11px}.meta .v{font-weight:600;margin-top:2px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{color:var(--dim);font-size:11px;font-weight:600;text-align:left;border-bottom:1px solid var(--b);padding:6px 4px}
th.r{text-align:right}td{padding:9px 4px;border-bottom:1px solid #f1f3f4}
.r{text-align:right}.b{font-weight:600}.dim{color:var(--dim)}
.tot{display:flex;justify-content:flex-end;margin-top:18px}.tot .box{width:280px;font-size:13px}
.tr{display:flex;justify-content:space-between;padding:2px 0;color:var(--dim)}
.grand{display:flex;justify-content:space-between;font-size:16px;font-weight:800;color:var(--ink);border-top:1px solid var(--b);padding-top:8px;margin-top:6px}
.pay{margin-top:22px;border-top:1px solid var(--b);padding-top:14px;font-size:13px;color:#555}.mono{font-family:ui-monospace,Menlo,monospace}.s{margin-bottom:4px}
@media(max-width:560px){.meta{grid-template-columns:1fr 1fr}}
@media print{body{background:#fff}.wrap{padding:0}.card{border:0;padding:0}.bar{display:none}}
</style></head><body><div class="wrap">
<div class="bar"><a class="btn" href="javascript:history.back()">← Til baka</a><button class="btn p" onclick="window.print()">Prenta</button></div>
<div class="card">
  <div class="head">
    <div><div class="eyebrow">${credit ? "Kreditreikningur frá" : "Reikningur frá"}</div><h1>${esc(inv.supplierName || "Óþekktur birgir")}</h1>${inv.supplierKennitala ? `<div class="dim" style="font-size:13px">kt. ${esc(inv.supplierKennitala)}</div>` : ""}</div>
    <div style="text-align:right"><div class="big">${esc(kr(inv.totalGross))}</div><span class="tag${credit ? " credit" : ""}">${credit ? "kreditreikningur" : "rafrænn reikningur"}</span></div>
  </div>
  <div class="meta">
    <div><div class="dim">Reikningsnr.</div><div class="v">${esc(inv.invoiceNumber || "—")}</div></div>
    <div><div class="dim">Dagsetning</div><div class="v">${esc(dags(inv.issueDate))}</div></div>
    <div><div class="dim">Gjalddagi</div><div class="v">${inv.dueDate ? esc(dags(inv.dueDate)) : "—"}</div></div>
    <div><div class="dim">Móttakandi</div><div class="v">${esc(x.buyerName)}</div></div>
  </div>
  <table><thead><tr><th>Lýsing</th><th class="r">Magn</th><th class="r">Einingaverð</th><th class="r">VSK</th><th class="r">Án VSK</th></tr></thead>
  <tbody>${lineRows || `<tr><td colspan="5" class="dim" style="text-align:center;padding:20px">Engar línur</td></tr>`}</tbody></table>
  <div class="tot"><div class="box">
    <div class="tr"><span>Samtals án VSK</span><span>${esc(kr(inv.totalNet))}</span></div>
    ${vatRows}
    <div class="grand"><span>Samtals</span><span>${esc(kr(inv.totalGross))}</span></div>
  </div></div>
  ${pay}
  ${x.note ? `<div class="dim" style="margin-top:16px;font-size:12px">${esc(x.note)}</div>` : ""}
</div></div></body></html>`;
}
