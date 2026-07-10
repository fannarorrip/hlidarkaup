// Arion / RB B2B AccountService client — HREYFINGARYFIRLIT (account statement/transactions).
// Contract (live WSDL, confirmed 2026-07-10):
//   https://ws.b2b.is/Statements/20131015/AccountService.svc — SOAP 1.2
//   ns A  = http://IcelandicOnlineBanking/2013/10/15/Accounts
//   ns AT = http://IcelandicOnlineBanking/2013/10/15/AccountTypes  (elementFormDefault=qualified)
//   GetAccountStatement{ Query{ Account?, DateFrom, DateTo, RecordFrom, RecordTo } } —
//   order is schema-enforced; RecordFrom/RecordTo are REQUIRED xs:long (1-based, inclusive).
// Response AccountStatement carries Balance/AvailableAmount/IBAN + Transactions/Transaction[].
// NOTE the naming trap: each <Transaction> LIST ITEM contains a string FIELD also named
// <Transaction> (færslulykill: 01=innborgun, 02=útborgun) — mapped to `code` here.
// TransactionID is EMPTY for intraday rows (RB assigns final ids next day) — don't use it alone
// as an idempotency key for today's rows.
// Reached through the B2B Bridge (plain UsernameToken) like BillService — never call ws.b2b.is directly.
import { XMLParser } from "fast-xml-parser";

const A = "http://IcelandicOnlineBanking/2013/10/15/Accounts";
const AT = "http://IcelandicOnlineBanking/2013/10/15/AccountTypes";
const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const PW_TEXT = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
const ACTION = "http://IcelandicOnlineBanking/2013/10/15/GetAccountStatement";

interface Cfg { url: string; user: string; pass: string }
function cfg(): Cfg {
  return {
    url: process.env.ARION_B2B_ACCOUNTS_URL || "",
    user: process.env.ARION_B2B_USERNAME || process.env.ARION_USERNAME || "",
    pass: process.env.ARION_B2B_PASSWORD || process.env.ARION_PASSWORD || "",
  };
}

export interface AccountsStatus { configured: boolean; have: { url: boolean; user: boolean; pass: boolean } }
export function accountsStatus(): AccountsStatus {
  const c = cfg(); const has = (v: string) => v.length > 0;
  return { configured: has(c.url) && has(c.user) && has(c.pass), have: { url: has(c.url), user: has(c.user), pass: has(c.pass) } };
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });
const arr = <T>(v: T | T[] | undefined): T[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const num = (v: unknown) => Number(String(v ?? "").replace(",", ".")) || 0;
const date = (v: unknown) => { const m = String(v ?? "").match(/^\d{4}-\d{2}-\d{2}/); return m ? m[0] : null; };

export interface B2bTransaction {
  transactionId: string;      // empty for intraday rows until RB assigns the final id
  transactionDate: string | null; // bókunardagur
  valueDate: string | null;   // vaxtadagur
  code: string;               // FÆRSLULYKILL (XSD field name "Transaction"): 01=innborgun, 02=útborgun
  amount: number;             // signed
  balance: number;            // running balance AFTER this transaction
  reference: string;          // tilvísun (often payer kennitala)
  referenceDetail: string;    // e.g. payer name
  payorId: string;            // kennitala of payer
  categoryCode: string;       // textalykill (03=millifærsla, 04=laun, …)
  category: string;           // human-readable category text
  billNumber: string;         // seðilnúmer
  batchNumber: string;        // bunkanúmer (originating bank system)
  redeemingBank: string;      // innlausnarbanki
}

export interface B2bStatement {
  account: string; currency: string; balance: number; availableAmount: number; overdraft: number;
  totalAmountWaiting: number; iban: string; accountOwnerId: string; accountInformation: string;
  status: string; transactions: B2bTransaction[];
}

export interface StatementResult { ok: boolean; statement?: B2bStatement; error?: string }

/** Fetch the hreyfingaryfirlit for one account + date range via the Bridge.
 *  account = 12 digits (útibú4 + höfuðbók2 + reikningur6). Records are 1-based inclusive. */
export async function getAccountStatement(opts: {
  account: string; dateFrom: string; dateTo: string; recordFrom?: number; recordTo?: number;
}): Promise<StatementResult> {
  const c = cfg();
  if (!accountsStatus().configured) return { ok: false, error: "B2B yfirlitsþjónusta er ekki stillt (ARION_B2B_ACCOUNTS_URL)." };
  const account = (opts.account || "").replace(/\D/g, "");
  if (account.length !== 12) return { ok: false, error: "Bankareikningur verður að vera 12 tölustafir (útibú+höfuðbók+reikningur)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.dateTo)) {
    return { ok: false, error: "Dagsetningar verða að vera YYYY-MM-DD." };
  }

  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" xmlns:at="${AT}">` +
    `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="${WSSE}">` +
    `<wsse:UsernameToken><wsse:Username>${esc(c.user)}</wsse:Username>` +
    `<wsse:Password Type="${PW_TEXT}">${esc(c.pass)}</wsse:Password></wsse:UsernameToken>` +
    `</wsse:Security></s:Header>` +
    // Wrapper + Query live in the Accounts ns; every Query FIELD is in the AccountTypes ns.
    // Field order is schema-enforced: Account, DateFrom, DateTo, RecordFrom, RecordTo.
    `<s:Body><GetAccountStatement xmlns="${A}"><Query>` +
    `<at:Account>${esc(account)}</at:Account>` +
    `<at:DateFrom>${esc(opts.dateFrom)}</at:DateFrom><at:DateTo>${esc(opts.dateTo)}</at:DateTo>` +
    `<at:RecordFrom>${Math.max(1, Math.floor(opts.recordFrom ?? 1))}</at:RecordFrom>` +
    `<at:RecordTo>${Math.max(1, Math.floor(opts.recordTo ?? 999999))}</at:RecordTo>` +
    `</Query></GetAccountStatement></s:Body></s:Envelope>`;

  try {
    const res = await fetch(c.url, {
      method: "POST",
      headers: { "content-type": `application/soap+xml; charset=utf-8; action="${ACTION}"` },
      body: envelope,
    });
    const text = await res.text();
    const parsed = parser.parse(text) as Record<string, unknown>;
    const body = ((parsed.Envelope as Record<string, unknown>)?.Body ?? {}) as Record<string, unknown>;
    const fault = body.Fault as Record<string, unknown> | undefined;
    if (fault) {
      const flat = JSON.stringify(fault);
      const m = flat.match(/"(?:BanksErrorText|GeneralErrorText|GeneralSourceText)":"([^"]{1,200})"/);
      return { ok: false, error: m ? m[1] : flat.slice(0, 300) };
    }
    if (!res.ok) return { ok: false, error: `B2B Bridge svaraði ${res.status}: ${text.slice(0, 300)}` };

    const st = (((body.GetAccountStatementResponse ?? {}) as Record<string, unknown>).AccountStatement ?? {}) as Record<string, unknown>;
    const txWrap = (st.Transactions ?? {}) as Record<string, unknown>;
    const transactions = arr(txWrap.Transaction as Record<string, unknown> | Record<string, unknown>[]).map((t) => ({
      transactionId: String(t.TransactionID ?? ""),
      transactionDate: date(t.TransactionDate),
      valueDate: date(t.ValueDate),
      code: String(t.Transaction ?? ""),          // field named like its parent — the færslulykill
      amount: num(t.Amount),
      balance: num(t.Balance),
      reference: String(t.Reference ?? ""),
      referenceDetail: String(t.ReferenceDetail ?? ""),
      payorId: String(t.PayorID ?? ""),
      categoryCode: String(t.CategoryCode ?? ""),
      category: String(t.Category ?? ""),
      billNumber: String(t.BillNumber ?? ""),
      batchNumber: String(t.BatchNumber ?? ""),
      redeemingBank: String(t.RedeemingBank ?? ""),
    }));
    return {
      ok: true,
      statement: {
        account: String(st.Account ?? account), currency: String(st.Currency ?? "ISK"),
        balance: num(st.Balance), availableAmount: num(st.AvailableAmount), overdraft: num(st.Overdraft),
        totalAmountWaiting: num(st.TotalAmountWaiting), iban: String(st.IBAN ?? ""),
        accountOwnerId: String(st.AccountOwnerID ?? ""), accountInformation: String(st.AccountInformation ?? ""),
        status: String(st.Status ?? ""), transactions,
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
