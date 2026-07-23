import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payClaim, paymentsStatus } from "@/lib/arion-b2b-payments";

// Pay a bank bill (krafa á okkur) IN FULL via Arion B2B DoPayment — REAL MONEY.
// Gated stjórnandi via middleware (/api/bankatenging). Body: { bankAccount } = bookkeeping ledger
// (Sjóður & banki) to credit. Books Dr lánadrottinn (supplier ap_account or 9300) / Cr bank on success.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BillRow {
  id: string; bank: string | null; ledger: string | null; number: string | null;
  due_date: string | null; description: string | null; amount_due: string;
  claimant_id: string | null; claimant_name: string | null; payor_id: string | null;
  status: string; payment_status: string | null; supplier_id: string | null;
  ap_account: string | null; supplier_name: string | null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as { bankAccount?: string }));
  const bankAccount = String(body.bankAccount || "").trim();
  if (!paymentsStatus().configured) {
    return NextResponse.json({ ok: false, message: "B2B greiðsluþjónusta er ekki stillt (ARION_B2B_PAYMENTS_URL + ARION_B2B_DEBIT_ACCOUNT)." });
  }
  if (!bankAccount) return NextResponse.json({ ok: false, message: "Veldu bankalykil til að bóka greiðsluna á." });

  // Claim the bill for payment atomically — a double-click can never pay twice.
  const claimed = await db.query<{ id: string }>(
    `update acc.bank_bills set payment_status='initiating'
      where id=$1 and status='open' and (payment_status is null or payment_status='failed')
      returning id`, [id]);
  if (!claimed.rows[0]) {
    return NextResponse.json({ ok: false, message: "Krafan er þegar í greiðsluferli eða frágengin." });
  }
  const revert = () => db.query(
    `update acc.bank_bills set payment_status='failed' where id=$1 and payment_status='initiating'`, [id]).catch(() => {});

  try {
    const b = (await db.query<BillRow>(
      `select b.id, b.bank, b.ledger, b.number, b.due_date::text as due_date, b.description,
              b.amount_due::text as amount_due, b.claimant_id, b.claimant_name, b.payor_id,
              b.status, b.payment_status, b.supplier_id, s.ap_account, s.name as supplier_name
         from acc.bank_bills b left join acc.suppliers s on s.id = b.supplier_id
        where b.id = $1`, [id])).rows[0];
    if (!b) { await revert(); return NextResponse.json({ ok: false, message: "Krafa fannst ekki." }); }

    const claimAccount = `${(b.bank || "").replace(/\D/g, "")}${(b.ledger || "").replace(/\D/g, "")}${(b.number || "").replace(/\D/g, "").padStart(6, "0")}`;
    const amount = Math.abs(Number(b.amount_due) || 0);
    if (claimAccount.length !== 12 || !b.due_date || !b.claimant_id || !amount) {
      await revert();
      return NextResponse.json({ ok: false, message: "Kröfuna vantar lykilgögn (útibú/höfuðbók/númer/gjalddaga/kröfuhafa)." });
    }

    const payeeName = b.claimant_name || b.supplier_name || b.claimant_id;
    const res = await payClaim({
      claimAccount,
      claimantId: b.claimant_id,
      payorId: b.payor_id || undefined,
      dueDate: b.due_date,
      amount,
      description: `Hlidarkaup greidsla`.slice(0, 35),
      isDeposit: false, // pay in full — bank may add costs; we book the RETURNED amount
    });

    if (!res.ok) {
      await revert();
      return NextResponse.json({ ok: false, message: res.error || `Greiðsla mistókst (${res.status}).` });
    }

    if (res.needsConfirmation) {
      // Registered at the bank but waiting for manual confirmation in netbanki (no STP yet).
      await db.query(
        `update acc.bank_bills set payment_status=$2, payment_ref=coalesce($3,payment_ref)
          where id=$1`, [id, res.status, res.paymentId ?? null]);
      return NextResponse.json({
        ok: true, needsConfirmation: true, status: res.status,
        message: "Greiðslan er skráð í bankanum en bíður staðfestingar í netbankanum (notandi er ekki með beinvinnslu/STP).",
      });
    }

    // Completed — book the payment: Dr lánadrottinn / Cr bank, at the ACTUAL amount withdrawn.
    // Þolmörk (endurskoðandakrafa): munur 1–500 kr milli þess sem fór af reikningnum og
    // kröfuupphæðarinnar (innheimtukostnaður) bókast á 6200 Vaxtagjöld og flaggast í
    // acc.recon_adjustments til mánaðaryfirferðar — lánadrottinn fær þá bara kröfuupphæðina.
    const paid = res.paidAmount && res.paidAmount > 0 ? res.paidAmount : amount;
    const apAccount = b.ap_account || "9300";
    const FEE_EXPENSE = "6200"; // Vaxtagjöld
    const feeDiff = paid - amount;
    const splitFee = feeDiff > 0 && feeDiff <= 500;
    const client = await db.connect();
    try {
      await client.query("begin");
      const wanted = splitFee ? [apAccount, bankAccount, FEE_EXPENSE] : [apAccount, bankAccount];
      const acct = await client.query<{ account_number: string }>(
        "select account_number from acc.accounts where account_number = any($1) and is_postable", [wanted]);
      const found = new Set(acct.rows.map((r: { account_number: string }) => r.account_number));
      if (!found.has(apAccount) || !found.has(bankAccount)) {
        await client.query("rollback");
        // Money HAS moved — do not lose that fact even though booking failed.
        await db.query(
          `update acc.bank_bills set status='paid', payment_status='paid_unbooked', payment_ref=$2, paid_at=now() where id=$1`,
          [id, res.paymentId ?? null]);
        return NextResponse.json({ ok: true, booked: false, message: `Greiðslan tókst (${res.paymentId ?? ""}) en bókun mistókst — bankalykill/skuldalykill er ekki færanlegur. Bókaðu handvirkt.` });
      }
      const useFeeSplit = splitFee && found.has(FEE_EXPENSE);
      const desc = `Greiðsla kröfu – ${payeeName}`.slice(0, 140);
      const lines = useFeeSplit
        ? [
            { account: apAccount, debit: amount, credit: 0, vat_code: null, description: desc },
            { account: FEE_EXPENSE, debit: feeDiff, credit: 0, vat_code: null, description: `Innheimtukostnaður – ${payeeName}`.slice(0, 140) },
            { account: bankAccount, debit: 0, credit: paid, vat_code: null, description: desc },
          ]
        : [
            { account: apAccount, debit: paid, credit: 0, vat_code: null, description: desc },
            { account: bankAccount, debit: 0, credit: paid, vat_code: null, description: desc },
          ];
      const v = await client.query<{ id: string; series_code: string; voucher_number: string }>(
        "select id, series_code, voucher_number::text as voucher_number from acc.post_voucher('JOURNAL',current_date,'payment',$1,$2,'bokhald',$3::jsonb, p_supplier_id => $4::uuid)",
        [desc, b.number || "krafa", JSON.stringify(lines), b.supplier_id]);
      if (useFeeSplit) {
        await client.query(
          `insert into acc.recon_adjustments (voucher_id, source, supplier_id, amount, note)
           values ($1,'bank_bill',$2,$3,$4)`,
          [v.rows[0].id, b.supplier_id, feeDiff, `Krafa ${b.number ?? ""} – ${payeeName}: greitt ${paid} kr., krafa ${amount} kr.`.slice(0, 300)]);
      }
      await client.query(
        `update acc.bank_bills set status='paid', payment_status='paid', payment_ref=$2,
                payment_voucher_id=$3, paid_at=now() where id=$1`,
        [id, res.paymentId ?? null, v.rows[0].id]);
      await client.query("commit");
      return NextResponse.json({
        ok: true, booked: true, paidAmount: paid, paymentId: res.paymentId,
        voucher: { series_code: v.rows[0].series_code, voucher_number: v.rows[0].voucher_number },
        message: paid !== amount ? `Greitt ${paid.toLocaleString("is-IS")} kr. (krafan bar kostnað umfram ${amount.toLocaleString("is-IS")} kr.).` : undefined,
      });
    } catch (e) {
      try { await client.query("rollback"); } catch { /* */ }
      // Payment succeeded at the bank; booking failed — record that truthfully.
      await db.query(
        `update acc.bank_bills set status='paid', payment_status='paid_unbooked', payment_ref=$2, paid_at=now() where id=$1`,
        [id, res.paymentId ?? null]).catch(() => {});
      console.error("bank-bill pay booking failed:", e);
      return NextResponse.json({ ok: true, booked: false, message: "Greiðslan tókst en bókun mistókst — bókaðu handvirkt (Dr lánadrottinn / Kr banki)." });
    } finally {
      client.release();
    }
  } catch (e) {
    await revert();
    console.error("bank-bill pay failed:", e);
    return NextResponse.json({ ok: false, message: "Greiðsla mistókst. Athugaðu tengingu og reyndu aftur." });
  }
}
