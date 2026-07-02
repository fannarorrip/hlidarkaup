-- Skjalanúmer (gap-free document number) for each retained source document.
-- Stamped on the served PDF and shown on the voucher. Sequential per Lög 145/1994
-- (fylgiskjöl must be gap-free), assigned automatically on insert.
set search_path = acc, public;

create sequence if not exists acc.document_seq start 1;
alter table acc.documents add column if not exists skjalanumer bigint not null default nextval('acc.document_seq');
