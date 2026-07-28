-- Tengir pósthólfsreikning við móttöku (goods receipt): "Í móttöku" hnappurinn á Móttöku-síðunni
-- dregur reikning beint úr pósthólfinu (inExchange UBL-XML eða tölvupósts-PDF) í móttökudrög —
-- ekkert handvirkt upload. receipt_id merkir að hann sé kominn þangað (birtist þá ekki aftur),
-- og pending-röð er um leið merkt 'skipped' svo hún tvíbókist ekki líka um pósthólfs-samþykkt.
set search_path = acc, public;

alter table acc.email_invoices
  add column if not exists receipt_id uuid references acc.goods_receipts(id);
