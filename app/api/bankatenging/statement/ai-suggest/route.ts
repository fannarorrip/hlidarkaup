import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { hasAnthropicKey } from "@/lib/invoice-extract";

// AI-tillögur að MÓTLYKLUM fyrir óbókaðar bankayfirlitslínur: línurnar sem hvorki lærð regla
// né pörun skýrir fá tillögu úr bókhaldslyklinum út frá mótaðila/skýringu/átt. Tillagan
// forfyllir bara reitinn í vafranum — notandinn ýtir sjálfur á Bóka (og þá lærist reglan).
// Gated stjórnandi via middleware (/api/bankatenging).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 80;

function parseJson(text: string): Record<string, unknown> {
  try { return JSON.parse(text); } catch { /* salvage */ }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch { /* fellur */ } }
  throw new Error("Svar gervigreindar var ekki gilt JSON");
}

export async function POST(req: NextRequest) {
  if (!hasAnthropicKey()) return NextResponse.json({ ok: false, message: "ANTHROPIC_API_KEY vantar" }, { status: 501 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  const ids: string[] = (Array.isArray(body.ids) ? body.ids : []).filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, BATCH);
  if (!ids.length) return NextResponse.json({ ok: true, suggestions: {} });

  // Gögnin sótt úr grunninum (client-inntakið er bara ID) — og lyklarnir sem má stinga upp á.
  const lines = await query<{ id: string; amount: string; counterparty: string | null; remittance: string | null; ledger_account: string | null }>(
    `select id, amount::text as amount, counterparty, remittance, ledger_account
     from acc.bank_transactions where id = any($1::uuid[]) and status = 'unmatched'`, [ids]);
  if (!lines.length) return NextResponse.json({ ok: true, suggestions: {} });
  const accounts = await query<{ account_number: string; name: string }>(
    `select account_number, name from acc.accounts where is_postable order by account_number`);
  const bankAccts = new Set(lines.map((l) => l.ledger_account).filter(Boolean) as string[]);
  const options = accounts.filter((a) => !bankAccts.has(a.account_number));
  const valid = new Set(options.map((a) => a.account_number));

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.SKRANING_MODEL || "claude-haiku-4-5-20251001";
  const msg = await client.messages.create({
    model, max_tokens: 4096,
    system: "Þú ert bókari íslenskrar matvöruverslunar og velur mótlykil fyrir bankafærslur. Svaraðu AÐEINS með hráu JSON, engum öðrum texta.",
    messages: [{
      role: "user",
      content: `Bókhaldslyklarnir (númer = heiti):\n${options.map((a) => `${a.account_number} = ${a.name}`).join("\n")}\n\n` +
        `Bankafærslurnar (id<TAB>átt<TAB>upphæð<TAB>mótaðili<TAB>skýring):\n` +
        lines.map((l) => `${l.id}\t${Number(l.amount) >= 0 ? "INN" : "ÚT"}\t${l.amount}\t${l.counterparty ?? ""}\t${l.remittance ?? ""}`).join("\n") +
        `\n\nVeldu líklegasta MÓTLYKILINN fyrir hverja færslu. Viðmið: kortauppgjör (Straumur/acquirer) INN → 7716; greiðslur viðskiptavina INN → 7600; greiðslur til birgja ÚT → 9300; laun ÚT → launatengdir lyklar; opinber gjöld ÚT → viðeigandi gjaldalyklar; bankakostnaður/FIT ÚT → 6210; vextir INN → 6100. Sértu í vafa um færslu, slepptu henni frekar en að giska út í loftið. Svaraðu með JSON: {"id":"lykilnúmer", ...}`,
    }],
  });
  const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const raw = parseJson(text);
  const suggestions: Record<string, string> = {};
  for (const [id, acct] of Object.entries(raw)) {
    if (typeof acct === "string" && valid.has(acct) && lines.some((l) => l.id === id)) suggestions[id] = acct;
  }
  return NextResponse.json({ ok: true, suggestions });
}
