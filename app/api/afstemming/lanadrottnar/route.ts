import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractStatement } from "@/lib/invoice-extract";
import { findSupplierByKennitala } from "@/lib/accounting-queries";
import { reconcileSupplierStatement } from "@/lib/supplier-reconcile";

// Lánadrottna-afstemming: upload a supplier statement (PDF/Excel) → AI-read → reconcile
// against our AP ledger for that supplier (matched by kennitala). Middleware-gated.
export const runtime = "nodejs";

interface InFile { name?: string; mime?: string; data?: string }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const filesIn: InFile[] = Array.isArray(body?.files) ? body.files : [];
  if (!filesIn.length) return NextResponse.json({ error: "Vantar skjal" }, { status: 400 });

  const files = filesIn.map((f) => {
    const raw = String(f.data || "");
    return { name: String(f.name || "yfirlit"), mime: String(f.mime || "application/octet-stream"), data: raw.includes(",") ? raw.split(",")[1] : raw };
  });

  let statement;
  try { statement = await extractStatement({ files }); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Lestur mistókst" }, { status: 400 }); }

  let supplierId: string | null = body?.supplierId || null;
  let supplierName = statement.supplier;
  if (!supplierId && statement.supplierKennitala) {
    const s = await findSupplierByKennitala(statement.supplierKennitala);
    if (s) { supplierId = s.id; supplierName = s.name; }
  }
  if (!supplierId) {
    return NextResponse.json({ ok: false, needSupplier: true, extracted: { supplier: statement.supplier, supplierKennitala: statement.supplierKennitala, lineCount: statement.lines.length } });
  }

  const result = await reconcileSupplierStatement(supplierId, statement.lines);

  const first = files[0];
  const bytes = Buffer.from(first.data, "base64");
  const row = (await db.query<{ id: string }>(
    `insert into acc.supplier_statements
       (supplier_id, supplier_kennitala, supplier_name, statement_date, closing_balance, doc_name, doc_mime, doc_bytes, extracted, result, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'bokhald') returning id`,
    [supplierId, statement.supplierKennitala || null, supplierName || statement.supplier || null,
     statement.statementDate || null, statement.closingBalance || null,
     first.name, first.mime, bytes, JSON.stringify(statement), JSON.stringify(result)])).rows[0];

  return NextResponse.json({
    ok: true, statementId: row.id, supplierId, supplierName,
    statementDate: statement.statementDate, closingBalance: statement.closingBalance, result,
  });
}
