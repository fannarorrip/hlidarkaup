-- ============================================================================
-- ⚠️  NÚLLSTILLING FÆRSLNA — EYÐIR ÖLLUM sölum, reikningum og bókhaldsfærslum!
-- ----------------------------------------------------------------------------
-- Til að byrja með hreint borð fyrir prófanir fyrir opnun. Heldur eftir ÖLLUM
-- grunngögnum: vörum, strikamerkjum, myndum, viðskiptamönnum, birgjum,
-- bókhaldslyklum, launþegum, stillingum, lærðum reglum (tx_account_rules).
--
-- Eyðir: fylgiskjölum + færslum, sölulínum, kröfum, reikningagerð, Z-skýrslum,
-- korta-/bankafærslum, afstemmingum, VSK-uppgjörum, innkaupum/móttökum,
-- launakeyrslum, skjölum. Númeraraðir byrja aftur á 1.
--
-- ATH: birgðastaða (stock_quantity) er EKKI endurstillt — hún verður talin við
-- opnun hvort eð er.
--
-- Keyrsla (á Rocky):
--   cd /opt/hlidarkaup && sudo -u hlidarkaup bash -c \
--     'set -a; source <(grep ^DATABASE_URL .env.local | tr -d "\r"); set +a; psql "$DATABASE_URL" -f deploy/reset-transactions.sql'
-- ============================================================================
begin;

truncate
  acc.ledger_entries,
  acc.documents,
  acc.claims,
  acc.billing_invoice_vouchers,
  acc.billing_invoices,
  acc.billing_runs,
  acc.z_reports,
  acc.card_transactions,
  acc.bank_transactions,
  acc.reconciliations,
  acc.vat_settlements,
  acc.email_invoices,
  acc.einvoice_outbox,
  acc.payables,
  acc.supplier_invoices,
  acc.supplier_statements,
  acc.goods_receipt_lines,
  acc.goods_receipts,
  acc.purchase_order_lines,
  acc.purchase_orders,
  acc.supplier_return_lines,
  acc.supplier_returns,
  acc.payroll_lines,
  acc.payroll_runs,
  acc.audit_log,
  shop.sale_lines,
  shop.stock_movements,
  shop.held_sales,
  acc.vouchers
  restart identity cascade;

-- Númeraraðir byrja upp á nýtt
update acc.voucher_series set next_number = 1;
alter sequence acc.document_seq restart with 1;

commit;

select 'Núllstillt — fylgiskjöl: ' || count(*) from acc.vouchers;
