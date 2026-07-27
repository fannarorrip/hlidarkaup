-- Mjólkurvörur fá ekki viðskiptamanna-afslátt (verðlagsvörur): flag allow_discount=false á öllum
-- mjólkurvörum, matched by name. Till behaviour: lineDisc skips the customer's discount_pct on
-- lines with allow_discount=false (manual per-line AFSL still possible). The per-product toggle in
-- the vöruritill ("afsláttur leyfður") remains the override for any product this pattern mis-flags.
--
-- The name-match includes real dairy (mjólk/skyr/rjómi/ostur/smjör/jógúrt/undanrenna/kotasæla/kefir)
-- and EXCLUDES look-alikes that are not price-regulated dairy: plant milks (möndlu/kókos/hafra/soja/
-- rís), smjörlíki, nut butters, chocolate (mjólkur-/rjómasúkkulaði), ice cream (rjómaís), snacks,
-- pastries and dishes that merely contain dairy. Reviewed against the live product list 2026-07-27
-- (580 products matched, spot-checked clean).
set search_path = shop, public;

update shop.products set allow_discount = false
where is_active
  and (name ilike '%mjólk%' or name ilike '%skyr%' or name ilike '%rjóm%' or name ilike '%ostur%'
       or name ilike '%osta%' or name ilike '%smjör%' or name ilike '%jógúrt%' or name ilike '%jogurt%'
       or name ilike '%undanrenn%' or name ilike '%kotasæl%' or name ilike '%kefir%')
  and not (
       name ilike '%möndlumjólk%' or name ilike '%kókosmjólk%' or name ilike '%haframjólk%'
    or name ilike '%sojamjólk%' or name ilike '%rísmjólk%' or name ilike '%hrísmjólk%' or name ilike '%hrismjólk%'
    or name ilike '%smjörlíki%' or name ilike '%smjörl/%'
    or name ilike '%hnetusmjör%' or name ilike '%möndlusmjör%'
    or name ilike '%mjólkursúkkulaði%' or name ilike '%rjómasúkkulaði%' or name ilike '%súkkulaðismjör%'
    or name ilike '%smjörkjúk%' or name ilike '%smjördeig%'
    or name ilike '%ostapopp%' or name ilike '%osta popp%' or name ilike '% popp%'
    or name ilike '%ostakúl%' or name ilike '%snakk%' or name ilike '%ostaslauf%'
    or name ilike '%vegan%' or name ilike '%hafra%'
    or name ilike '%kókosjógúrt%' or name ilike '%sojajógúrt%'
    or name ilike '%pyls%' or name ilike '%með smjöri%' or name ilike '%m/smjöri%' or name ilike '%smjörolíu%'
    or name ilike '%ostakök%' or name ilike '%ostakaka%'
    or name ilike '%rjómaís%' or name ilike '%smjörkaka%' or name ilike '%smjörkök%'
    or name ilike '%bollur%' or name ilike '%bolla%'
    or name ilike '%rísköku%' or name ilike '%rískökur%'
    or name ilike '%tortellini%'
    or name ilike '%súkkulaði & jógúrt%' or name ilike '%súkkulaði-jógúrt%' or name ilike '%súkkulaði&jógúrt%'
    or name ilike '%sprauturjómi%' or name ilike '%kasjú%'
    or name ilike '%rjómalög%' or name ilike '%sósa%' or name ilike '%maís %'
  );
