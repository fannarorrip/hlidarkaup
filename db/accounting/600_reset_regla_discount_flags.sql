-- Reset allow_discount=true á öllu NEMA mjólkurvörum. Regla-importið bar með sér gamla
-- "afsláttur leyfður" flaggið frá fyrri eiganda (2.786 vörur false, source='regla' o.fl.) —
-- það var aldrei notað af okkar kassa fyrr en 590/f4f04fc gerðu flaggið virkt, og þá fóru
-- handahófskenndar vörur (kaffisíróp, kjúklingalundir…) að sleppa viðskiptamanna-afslætti.
-- Eftir þessa keyrslu er staðan hrein: AÐEINS mjólkurvörur (590-mynstrið) eru false.
-- Einstakar vörur má áfram stilla í vöruritlinum ("afsláttur leyfður").
set search_path = shop, public;

update shop.products set allow_discount = true
where allow_discount = false
  and not (
    (name ilike '%mjólk%' or name ilike '%skyr%' or name ilike '%rjóm%' or name ilike '%ostur%'
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
    )
  );
