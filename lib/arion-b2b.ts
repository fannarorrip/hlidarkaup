// Arion / RB B2B "Unpaid Bills" (ógreiddar kröfur) client — Hlíðarkaup as PAYOR.
// Contract: BillService at ws.b2b.is/Statements/20130201/BillService.svc (SOAP 1.2).
//   GetBills() -> GetBillsResponse/GetBillsResult (ArrayOfBillInfo). Empty input.
//   BillInfo{ Bank,Ledger,Number,DueDate,Identifier,Description,FinalDueDate,AmountDue,
//             MinimumAmount,ClaimantId,PayorId,ClaimType,BillType,IsDebited,IsForwardPayment,
//             IsSettlementFee,IsDeposit,IsInElectronicDocuments,Details,IsHidden }
//
// The direct service uses WCF SymmetricBinding (message-level encryption) that we do NOT hand-roll
// in Node. Instead we talk to the **B2B Bridge** (Arion's .NET/WAS app on the Windows till PC),
// which exposes the SAME contract over ClearUsernameBinding (plain WS-Security UsernameToken, no
// encryption) on localhost/LAN. Point ARION_B2B_BRIDGE_URL at the Bridge. See deploy/ARION_B2B_BRIDGE.md.
import { XMLParser } from "fast-xml-parser";
import { query } from "@/lib/db";

const NS = "http://schemas.b2b.is/Bills/2013/02/01/BillService";
const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const PW_TEXT = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";

interface Cfg { url: string; user: string; pass: string; payorId: string }
function cfg(): Cfg {
  return {
    url: process.env.ARION_B2B_BRIDGE_URL || "",
    user: process.env.ARION_B2B_USERNAME || process.env.ARION_USERNAME || "",
    pass: process.env.ARION_B2B_PASSWORD || process.env.ARION_PASSWORD || "",
    payorId: (process.env.ARION_B2B_PAYOR_ID || process.env.ARION_PSU_ID || "").replace(/\D/g, ""),
  };
}

export interface B2bStatus { configured: boolean; have: { url: boolean; user: boolean; pass: boolean } }
export function b2bStatus(): B2bStatus {
  const c = cfg(); const has = (v: string) => v.length > 0;
  return { configured: has(c.url) && has(c.user) && has(c.pass), have: { url: has(c.url), user: has(c.user), pass: has(c.pass) } };
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
const arr = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);

export interface BankBill {
  bank: string; ledger: string; number: string; dueDate: string | null; finalDueDate: string | null;
  identifier: string; description: string; amountDue: number; minimumAmount: number; currency: string;
  claimantId: string; claimantName: string; payorId: string; claimType: string; billType: string;
  isDebited: boolean; isForwardPayment: boolean; isSettlementFee: boolean; isDeposit: boolean;
  isInElectronicDocuments: boolean; isHidden: boolean;
  billKey: string; raw: Record<string, unknown>;
}

// The RB "Amount" type is a complex value; accept an object ({Value/Amount, Currency}) or a scalar.
function amount(v: unknown): { value: number; currency: string } {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const raw = o.Value ?? o.Amount ?? o.value ?? o.amount ?? 0;
    const cur = String(o.Currency ?? o.currency ?? "ISK");
    return { value: Number(String(raw).replace(",", ".")) || 0, currency: cur };
  }
  return { value: Number(String(v ?? "").replace(",", ".")) || 0, currency: "ISK" };
}
const bool = (v: unknown) => String(v ?? "").toLowerCase() === "true";
const date = (v: unknown) => { const s = String(v ?? ""); const m = s.match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : null; };

function toBill(b: Record<string, unknown>): BankBill {
  const due = date(b.DueDate);
  const amt = amount(b.AmountDue);
  const bank = String(b.Bank ?? ""), ledger = String(b.Ledger ?? ""), number = String(b.Number ?? "");
  const claimantId = String(b.ClaimantId ?? "").replace(/\D/g, "");
  const payorId = String(b.PayorId ?? "").replace(/\D/g, "");
  // The bank sends the claimant's registered name in Details (e.g. "Regla ehf.").
  const details = (b.Details ?? {}) as Record<string, unknown>;
  return {
    bank, ledger, number, dueDate: due, finalDueDate: date(b.FinalDueDate),
    identifier: String(b.Identifier ?? ""), description: String(b.Description ?? ""),
    amountDue: amt.value, minimumAmount: amount(b.MinimumAmount).value, currency: amt.currency,
    claimantId, claimantName: String(details.ClaimantName ?? ""),
    payorId, claimType: String(b.ClaimType ?? ""), billType: String(b.BillType ?? ""),
    isDebited: bool(b.IsDebited), isForwardPayment: bool(b.IsForwardPayment), isSettlementFee: bool(b.IsSettlementFee),
    isDeposit: bool(b.IsDeposit), isInElectronicDocuments: bool(b.IsInElectronicDocuments), isHidden: bool(b.IsHidden),
    // BillKey identity: Bank|Ledger|Number|DueDate|PayorId|ClaimantId
    billKey: [bank, ledger, number, due ?? "", payorId, claimantId].join("|"),
    raw: b,
  };
}

export interface GetBillsResult { ok: boolean; bills: BankBill[]; error?: string }

/** Fetch all current unpaid bills where we are the payor, via the B2B Bridge (GetBills). */
export async function getBills(): Promise<GetBillsResult> {
  const c = cfg();
  if (!c.url || !c.user || !c.pass) return { ok: false, bills: [], error: "B2B Bridge er ekki stillt (ARION_B2B_BRIDGE_URL/USERNAME/PASSWORD)." };
  // SOAP 1.1 toward the Bridge (its ClearUsernameBinding is messageVersion=Soap11; SOAP 1.2 → HTTP 415).
  // The Bridge converts to the bank's SOAP 1.2 upstream — verified live 2026-07-10.
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="${WSSE}">` +
    `<wsse:UsernameToken><wsse:Username>${esc(c.user)}</wsse:Username>` +
    `<wsse:Password Type="${PW_TEXT}">${esc(c.pass)}</wsse:Password></wsse:UsernameToken>` +
    `</wsse:Security></s:Header>` +
    `<s:Body><GetBills xmlns="${NS}"/></s:Body></s:Envelope>`;
  try {
    const res = await fetch(c.url, {
      method: "POST",
      headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${NS}/IBillService/GetBills"` },
      body: envelope,
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, bills: [], error: `B2B Bridge svaraði ${res.status}: ${text.slice(0, 300)}` };
    const parsed = parser.parse(text) as Record<string, unknown>;
    const body = ((parsed.Envelope as Record<string, unknown>)?.Body ?? {}) as Record<string, unknown>;
    const fault = body.Fault as Record<string, unknown> | undefined;
    if (fault) return { ok: false, bills: [], error: `B2B villa: ${JSON.stringify(fault).slice(0, 300)}` };
    const resp = (body.GetBillsResponse ?? {}) as Record<string, unknown>;
    const result = (resp.GetBillsResult ?? {}) as Record<string, unknown>;
    const rows = arr(result.BillInfo as Record<string, unknown> | Record<string, unknown>[]);
    return { ok: true, bills: rows.map(toBill) };
  } catch (e) {
    return { ok: false, bills: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export interface UpsertResult { fetched: number; open: number; gone: number }

/** Upsert fetched bills into acc.bank_bills, match lánadrottinn by claimant kt, and mark any
 *  previously-open bill that is no longer returned as 'gone' (paid/withdrawn at the bank). */
export async function upsertBankBills(bills: BankBill[]): Promise<UpsertResult> {
  const keys: string[] = [];
  for (const b of bills) {
    keys.push(b.billKey);
    await query(
      `insert into acc.bank_bills
         (bill_key, bank, ledger, number, due_date, final_due_date, identifier, description,
          amount_due, minimum_amount, currency, claimant_id, claimant_name, payor_id, claim_type,
          bill_type, is_debited, is_forward_payment, is_settlement_fee, is_deposit,
          is_in_electronic_documents, is_hidden, raw, supplier_id, last_seen_at)
       values ($1,$2,$3,$4,$5::date,$6::date,$7,$8,$9,$10,$11,$12,
               coalesce(nullif($13,''), (select s.name from acc.suppliers s where regexp_replace(coalesce(s.kennitala,''),'\\D','','g') = $12 limit 1)),
               $14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,
               (select s.id from acc.suppliers s where regexp_replace(coalesce(s.kennitala,''),'\\D','','g') = $12 limit 1),
               now())
       on conflict (bill_key) do update set
         due_date = excluded.due_date, final_due_date = excluded.final_due_date,
         identifier = excluded.identifier, description = excluded.description,
         amount_due = excluded.amount_due, minimum_amount = excluded.minimum_amount,
         currency = excluded.currency, claim_type = excluded.claim_type, bill_type = excluded.bill_type,
         is_debited = excluded.is_debited, is_forward_payment = excluded.is_forward_payment,
         is_settlement_fee = excluded.is_settlement_fee, is_deposit = excluded.is_deposit,
         is_in_electronic_documents = excluded.is_in_electronic_documents, is_hidden = excluded.is_hidden,
         raw = excluded.raw, claimant_name = coalesce(excluded.claimant_name, acc.bank_bills.claimant_name),
         supplier_id = coalesce(excluded.supplier_id, acc.bank_bills.supplier_id),
         last_seen_at = now(),
         status = case when acc.bank_bills.status in ('paid','ignored') then acc.bank_bills.status
                       when excluded.is_hidden then 'hidden' else 'open' end`,
      [b.billKey, b.bank, b.ledger, b.number, b.dueDate, b.finalDueDate, b.identifier, b.description,
       b.amountDue, b.minimumAmount, b.currency, b.claimantId, b.claimantName, b.payorId, b.claimType, b.billType,
       b.isDebited, b.isForwardPayment, b.isSettlementFee, b.isDeposit, b.isInElectronicDocuments,
       b.isHidden, JSON.stringify(b.raw)],
    );
  }
  // Anything still 'open' but not returned this round has left the bank's list → mark 'gone'.
  const gone = keys.length
    ? await query<{ id: string }>(
        `update acc.bank_bills set status='gone', last_seen_at=now()
           where status='open' and bill_key <> all($1::text[]) returning id`, [keys])
    : await query<{ id: string }>(`update acc.bank_bills set status='gone' where status='open' returning id`);
  return { fetched: bills.length, open: keys.length, gone: gone.length };
}

export interface OpenBankBill {
  id: string; bill_key: string; number: string | null; due_date: string | null; final_due_date: string | null;
  description: string | null; identifier: string | null; amount_due: number; currency: string;
  claimant_id: string | null; claimant_name: string | null; claim_type: string | null; bill_type: string | null;
  is_debited: boolean; status: string; supplier_id: string | null; days_until_due: number | null;
}

/** Open bank bills we owe, earliest due first. */
export function listOpenBankBills() {
  return query<OpenBankBill>(
    `select id, bill_key, number, due_date::text as due_date, final_due_date::text as final_due_date,
            description, identifier, amount_due::float8 as amount_due, currency, claimant_id, claimant_name,
            claim_type, bill_type, is_debited, status, supplier_id,
            case when due_date is null then null else (due_date - current_date) end as days_until_due
       from acc.bank_bills
      where status = 'open'
      order by due_date asc nulls last, amount_due desc`);
}
