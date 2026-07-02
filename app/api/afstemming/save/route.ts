import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Save/resume a reconciliation (bank). Upsert by id.
export async function POST(req: NextRequest) {
  const b = await req.json();
  const diff = Number(b.ledger_balance ?? 0) - Number(b.statement_balance ?? 0);
  const cleared: string[] = Array.isArray(b.cleared) ? b.cleared.map((x: unknown) => String(x)) : [];
  try {
    if (b.id) {
      await db.query(
        `update acc.reconciliations set statement_balance=$2, ledger_balance=$3, difference=$4,
           cleared=$5::bigint[], status=$6, as_of_date=$7::date, note=$8, updated_at=now() where id=$1`,
        [b.id, b.statement_balance ?? null, b.ledger_balance ?? null, diff, cleared, b.status || "open", b.as_of_date, b.note ?? null]);
      return NextResponse.json({ ok: true, id: b.id });
    }
    const r = await db.query<{ id: string }>(
      `insert into acc.reconciliations
         (recon_type, account_number, as_of_date, statement_balance, ledger_balance, difference, cleared, status, note, created_by)
       values ($1,$2,$3::date,$4,$5,$6,$7::bigint[],$8,$9,'bokhald') returning id`,
      [b.recon_type || "bank", b.account_number ?? null, b.as_of_date, b.statement_balance ?? null, b.ledger_balance ?? null, diff, cleared, b.status || "open", b.note ?? null]);
    return NextResponse.json({ ok: true, id: r.rows[0].id });
  } catch (err) {
    console.error("[afstemming save]", err);
    return NextResponse.json({ error: "Villa við vistun" }, { status: 500 });
  }
}
