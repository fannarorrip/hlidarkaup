-- Accent-insensitive product search (so "rjomi" finds "RJÓMI"). The vörur search is
-- now server-side over ALL products, not a client filter over the first 2000.
create extension if not exists unaccent;
