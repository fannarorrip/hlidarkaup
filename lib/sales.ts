// Posts a sale as a compliant double-entry voucher into the acc ledger.
// Modes: 'card' (debit card receivable 7716) or 'account' (debit customer AR, á reikning).
import { db } from "@/lib/db";
import { handleAccountSaleBilling } from "@/lib/billing";
import { SERIES_PREFIX } from "@/lib/format";

const CARD_ACCOUNT = process.env.KASSI_CARD_ACCOUNT ?? "7716";       // Óskilgreind kreditkort
const CASH_ACCOUNT = process.env.KASSI_CASH_ACCOUNT ?? "7850";       // Sjóður (reiðufé)
const TRANSFER_ACCOUNT = process.env.KASSI_TRANSFER_ACCOUNT ?? "7830"; // bankareikningur (símgreiðsla/millifærsla)
const DEFAULT_AR_ACCOUNT = "7600";                                   // Viðskiptakröfur

// VAT rate → (sales account, output-VAT account, vat code)
const RATE_MAP: Record<number, { sales: string; vat?: string; code: string }> = {
  24: { sales: "1200", vat: "9530", code: "S24" },
  11: { sales: "1213", vat: "9532", code: "S11" },
  0:  { sales: "1220", vat: undefined, code: "S00" },
};
const rateConfig = (rate: number) => RATE_MAP[rate] ?? RATE_MAP[24];

export type PayMode = "card" | "account" | "cash" | "transfer";
// unitPrice = gross unit-price override (VERÐ); discount = gross kr off the whole line (AFSL).
// Only honoured on the staffed till (trusted); the kiosk/web never send these.
export interface SaleItem { id: string; quantity: number; unitPrice?: number; discount?: number; }
export interface PaymentInfo { approved: boolean; processor?: string; stan?: string; last4?: string; verification?: string; }
// A free (non-catalog) line. gross = whole-line gross incl. VAT. quantity/unitPrice are optional
// display metadata (manual invoices show "3 × 1.500 kr"); default to 1 × gross for legacy callers.
export interface ExtraLine { description: string; gross: number; vat_rate: number; quantity?: number; unitPrice?: number; }

export interface PostSaleOpts {
  mode: PayMode;
  kind?: "sale" | "return"; // 'return' = refund: money out, sales reversed, stock back up
  customerId?: string | null;
  payment?: PaymentInfo;
  ignoreStock?: boolean;
  series?: string;
  voucherType?: string;
  description?: string;
  reference?: string;
  extraLines?: ExtraLine[];
  decrementStock?: boolean;
  source?: string; // sales channel: 'till' | 'kiosk' | 'web' | 'eldhus'
  registerId?: string | null; // which register rang it (kassi1-3 / sjalfsafgreidsla1-2)
  skipBilling?: boolean; // manual invoice: caller drives claim + delivery itself (no auto-billing)
}

interface ProductRow {
  product_number: string; name: string; price_gross: number;
  vat_rate: string; stock_quantity: string; is_stock_controlled: boolean;
}

export class SaleError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export async function postSale(items: SaleItem[], opts: PostSaleOpts): Promise<{ invoiceNumber: string; voucherNumber: string; voucherId: string }> {
  const ignoreStock = opts.ignoreStock ?? process.env.KASSI_IGNORE_STOCK === "true";
  const series = opts.series ?? "KASSI";
  const decrementStock = opts.decrementStock ?? true;
  const isReturn = opts.kind === "return";
  // sale: money debited, sales/vat credited, stock down. return: the exact opposite.
  const moneySide = (amt: number) => isReturn ? { debit: 0, credit: amt } : { debit: amt, credit: 0 };
  const saleSide = (amt: number) => isReturn ? { debit: amt, credit: 0 } : { debit: 0, credit: amt };

  const client = await db.connect();
  try {
    await client.query("begin");

    // Resolve the debit (money-in) account by payment mode
    let debitAccount = CARD_ACCOUNT;
    if (opts.mode === "cash") debitAccount = CASH_ACCOUNT;
    else if (opts.mode === "transfer") debitAccount = TRANSFER_ACCOUNT;
    else if (opts.mode === "account") {
      if (!opts.customerId) throw new SaleError("Veldu viðskiptamann fyrir reikningssölu", 400);
      const cust = (await client.query<{ ar_account: string | null; is_account: boolean; name: string }>(
        `select ar_account, is_account, name from shop.customers where id = $1`, [opts.customerId])).rows[0];
      if (!cust) throw new SaleError("Viðskiptamaður fannst ekki", 404);
      if (!cust.is_account) throw new SaleError("Þessi viðskiptamaður má ekki kaupa á reikning", 400);
      debitAccount = cust.ar_account ?? DEFAULT_AR_ACCOUNT;
    }

    const ids = [...new Set(items.map((i) => i.id))];
    const prods = (await client.query(
      `select product_number, name, price_gross, vat_rate, stock_quantity, is_stock_controlled
         from shop.products where product_number = any($1::text[]) for update`, [ids])).rows as ProductRow[];
    const byId = new Map(prods.map((p): [string, ProductRow] => [p.product_number, p]));
    for (const it of items) if (!byId.has(it.id)) throw new SaleError(`Vara ${it.id} fannst ekki`, 404);

    if (!ignoreStock && !isReturn) {
      const short = items.filter((it) => {
        const p = byId.get(it.id)!;
        return p.is_stock_controlled && Number(p.stock_quantity) < it.quantity;
      });
      if (short.length) throw new SaleError(`Ekki til á lager: ${short.map((s) => byId.get(s.id)!.name).join(", ")}`, 409);
    }

    // Effective unit price (catalog or VERÐ override) and discounted line gross (AFSL).
    const lineGrossOf = (it: SaleItem, p: ProductRow) => {
      const unit = it.unitPrice != null ? Number(it.unitPrice) : Number(p.price_gross);
      return { unit, gross: Math.max(0, Math.round(unit * it.quantity - (Number(it.discount) || 0))) };
    };

    const grossByRate = new Map<number, number>();
    for (const it of items) {
      const p = byId.get(it.id)!;
      grossByRate.set(Number(p.vat_rate), (grossByRate.get(Number(p.vat_rate)) ?? 0) + lineGrossOf(it, p).gross);
    }
    for (const ex of opts.extraLines ?? []) {
      grossByRate.set(Number(ex.vat_rate), (grossByRate.get(Number(ex.vat_rate)) ?? 0) + Math.round(ex.gross));
    }

    const creditLines: { account: string; debit: number; credit: number; vat_code: string; description: string }[] = [];
    let totalGross = 0;
    for (const [rate, gross] of grossByRate) {
      const cfg = rateConfig(rate);
      const vat = cfg.vat ? Math.round((gross * rate) / (100 + rate)) : 0;
      const net = gross - vat;
      creditLines.push({ account: cfg.sales, ...saleSide(net), vat_code: cfg.code, description: `Sala ${rate}%` });
      if (cfg.vat && vat > 0) creditLines.push({ account: cfg.vat, ...saleSide(vat), vat_code: cfg.code, description: `Útskattur ${rate}%` });
      totalGross += gross;
    }

    const payDesc = opts.mode === "account" ? "Á reikning"
      : opts.mode === "cash" ? "Reiðufé"
      : opts.mode === "transfer" ? "Símgreiðsla / millifærsla"
      : `Kortagreiðsla${opts.payment?.last4 ? " **** " + opts.payment.last4 : ""}`;
    const debitDesc = isReturn ? `Endurgreiðsla – ${payDesc}` : payDesc;
    const lines = [{ account: debitAccount, ...moneySide(totalGross), vat_code: null, description: debitDesc }, ...creditLines];

    const ref = opts.reference ?? `${series}-${opts.payment?.stan ?? Date.now()}`;
    const today = new Date().toISOString().slice(0, 10);
    const v = (await client.query<{ id: string; voucher_number: string }>(
      `select id, voucher_number from acc.post_voucher($1,$2::date,$3,$4,$5,$6,$7::jsonb,null,$8,$9, p_register_id => $10)`,
      [series, today, opts.voucherType ?? "kassi_sale", opts.description ?? "Sala", ref, "kassi",
       JSON.stringify(lines), opts.customerId ?? null, opts.source ?? null, opts.registerId ?? null])).rows[0];

    // Record the per-product sale lines for the receipt
    let ln = 0;
    for (const it of items) {
      const p = byId.get(it.id)!;
      ln++;
      const q = isReturn ? -it.quantity : it.quantity; // returns net out sold quantity
      const { unit, gross } = lineGrossOf(it, p);       // effective unit + discounted line gross
      await client.query(
        `insert into shop.sale_lines (voucher_id, line_no, product_number, name, quantity, unit_price_gross, line_total, vat_rate)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [v.id, ln, p.product_number, p.name, q, unit, isReturn ? -gross : gross, Number(p.vat_rate)]);
    }
    for (const ex of opts.extraLines ?? []) {
      ln++;
      const qty = ex.quantity ?? 1;
      const unit = ex.unitPrice ?? Math.round(ex.gross);
      await client.query(
        `insert into shop.sale_lines (voucher_id, line_no, product_number, name, quantity, unit_price_gross, line_total, vat_rate)
         values ($1,$2,null,$3,$4,$5,$6,$7)`,
        [v.id, ln, ex.description, qty, unit, Math.round(ex.gross), Number(ex.vat_rate)]);
    }

    if (decrementStock) {
      for (const it of items) {
        const p = byId.get(it.id)!;
        if (p.is_stock_controlled) {
          const delta = isReturn ? it.quantity : -it.quantity;
          await client.query(`update shop.products set stock_quantity = stock_quantity + $1 where product_number = $2`, [delta, it.id]);
          await client.query(`insert into shop.stock_movements (product_number, qty_delta, type, ref_type, ref_id, created_by) values ($1,$2,'sale','voucher',$3,$4)`, [it.id, delta, v.id, opts.source ?? "kassi"]);
        }
      }
    }

    await client.query("commit");

    // Account sale → per-customer billing: per-trip customers get an invoice + krafa now;
    // consolidated customers wait for the month-end run. Best-effort — never breaks the sale.
    // skipBilling: the manual "Búa til reikning" flow drives claim + delivery itself.
    if (!isReturn && opts.mode === "account" && opts.customerId && !opts.skipBilling) {
      await handleAccountSaleBilling(v.id, opts.customerId);
    }

    const prefix = SERIES_PREFIX[series] ?? series; // HK for kassasala etc. — same map as all displays
    return { invoiceNumber: `${prefix}-${String(v.voucher_number).padStart(6, "0")}`, voucherNumber: String(v.voucher_number), voucherId: v.id };
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

/** Self-checkout (card) — unchanged interface. */
export async function postKassiSale(items: SaleItem[], payment: PaymentInfo, opts: { ignoreStock?: boolean; registerId?: string | null } = {}) {
  return postSale(items, {
    mode: "card", payment, ignoreStock: opts.ignoreStock, registerId: opts.registerId ?? null,
    voucherType: "kassi_sale", source: "kiosk",
    description: `Kassasala${payment.stan ? " · STAN " + payment.stan : ""}`,
    reference: `KASSI-${payment.stan ?? Date.now()}`,
  });
}
