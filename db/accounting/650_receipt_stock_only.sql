-- Móttaka á ÞEGAR BÓKUÐUM reikningum: bókaðir pósthólfsreikningar mega fara í móttöku til að
-- lesa línur og telja inn birgðir — en staðfestingin má EKKI bóka reikninginn aftur.
-- book_invoice=false á móttökunni = "birgðir + verð, engin bókun" (reikningurinn er bókaður annars
-- staðar). mottaka_hidden felur pósthólfsröð úr móttöku-biðröðinni ("Henda" hnappurinn).
set search_path = acc, public;

alter table acc.goods_receipts add column if not exists book_invoice boolean not null default true;
alter table acc.email_invoices  add column if not exists mottaka_hidden boolean not null default false;
