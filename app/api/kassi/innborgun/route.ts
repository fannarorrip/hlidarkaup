import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// INNBORGUN Á REIKNING á kassanum: viðskiptamaður (t.d. billing_mode 'instore' — „greiðir í
// verslun um mánaðamót") borgar úttektarsummuna sína á posanum eða með reiðufé. Bókast sem
// receipt-fylgiskjal: Dr 7716 (kort á leiðinni) / 7850 (sjóður) — Cr kröfulykill viðskipta-
// mannsins, tengt honum (customer_id) svo staðan lækkar og mánaðarreikningurinn stemmir.
// Kortið er ÞEGAR rukkað á posanum þegar POST berst (sama mynstur og salan: rukka fyrst,
// bóka svo — mistakist bókunin bókar „þegar rukkað"-leiðin aftur ÁN nýrrar rukkunar).
// Gated af /api/kassi-reglunni í middleware (kiosk/starfsmannasessjón).
export const runtime = "nodejs";

const CARD_ACCOUNT = process.env.KASSI_CARD_ACCOUNT ?? "7716";
const CASH_ACCOUNT = process.env.KASSI_CASH_ACCOUNT ?? "7850";

export async function GET(req: NextRequest) {
  const cid = req.nextUrl.searchParams.get("customer") || "";
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return NextResponse.json({ ok: false, error: "Vantar viðskiptamann" }, { status: 400 });
  const r = (await query<{ name: string; balance: string }>(
    `select c.name, coalesce(sum(le.debit - le.credit), 0)::text as balance
     from shop.customers c
     left join acc.vouchers v on v.customer_id = c.id and v.status in ('posted','reversed')
     left join acc.ledger_entries le on le.voucher_id = v.id and le.account_number = coalesce(c.ar_account, '7600')
     where c.id = $1
     group by c.id, c.name`, [cid]))[0];
  if (!r) return NextResponse.json({ ok: false, error: "Viðskiptamaður fannst ekki" }, { status: 404 });
  return NextResponse.json({ ok: true, name: r.name, balance: Math.round(Number(r.balance)) });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) ?? {};
  const cid = String(b.customer_id || "");
  const amount = Math.round(Number(b.amount) || 0);
  const method = b.method === "cash" ? "cash" : "card";
  const reg = String(b.reg || "kassi").slice(0, 20);
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return NextResponse.json({ ok: false, error: "Vantar viðskiptamann" }, { status: 400 });
  if (!(amount > 0) || amount > 10_000_000) return NextResponse.json({ ok: false, error: "Ógild upphæð" }, { status: 400 });
  const cust = (await query<{ name: string; ar_account: string | null; is_account: boolean }>(
    `select name, ar_account, is_account from shop.customers where id = $1 and is_active`, [cid]))[0];
  if (!cust?.is_account) return NextResponse.json({ ok: false, error: "Viðskiptamaður fannst ekki eða er ekki í reikningsviðskiptum" }, { status: 400 });

  const desc = `Innborgun á reikning — ${cust.name} (${method === "cash" ? "reiðufé" : "kort"}, ${reg})`;
  const lines = [
    { account: method === "cash" ? CASH_ACCOUNT : CARD_ACCOUNT, debit: amount, credit: 0, vat_code: null, description: "Innborgun á reikning" },
    { account: cust.ar_account || "7600", debit: 0, credit: amount, vat_code: null, description: "Innborgun á reikning" },
  ];
  try {
    const v = (await query<{ series_code: string; voucher_number: string }>(
      `select series_code, voucher_number::text as voucher_number
       from acc.post_voucher('JOURNAL', current_date, 'receipt', $1, $2, $3, $4::jsonb, null, $5::uuid)`,
      [desc, `innb-${reg}-${Date.now()}`, `kassi:${reg}`, JSON.stringify(lines), cid]))[0];
    return NextResponse.json({ ok: true, voucher: `${v.series_code}-${v.voucher_number}` });
  } catch (e) {
    console.error("innborgun failed:", e);
    return NextResponse.json({ ok: false, error: "Bókun mistókst" }, { status: 500 });
  }
}
