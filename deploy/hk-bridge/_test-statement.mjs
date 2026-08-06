// Live read-only test of hk-bridge: GetAccountStatement exactly as lib/arion-b2b-accounts.ts sends it.
// Reads creds from .env.local — NEVER prints them or the raw envelope.
import fs from "node:fs";
const env = fs.readFileSync("C:/Projects/hlidarkaup/.env.local", "utf8");
const get = (k) => { const m = env.match(new RegExp(`^\\s*${k}=(.*)$`, "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
const user = get("ARION_B2B_USERNAME") || get("ARION_USERNAME");
const pass = get("ARION_B2B_PASSWORD") || get("ARION_PASSWORD");
const account = (get("ARION_B2B_DEBIT_ACCOUNT") || "").replace(/\D/g, "");
if (!user || !pass) { console.log("VANTAR ARION_B2B_USERNAME/PASSWORD í .env.local"); process.exit(1); }
// Bankinn XSD-HAFNAR fyrirspurn án Account (villa 1200, staðfest 6.8) þó WSDL segi minOccurs=0.
if (account.length !== 12) { console.log("VANTAR ARION_B2B_DEBIT_ACCOUNT í .env.local (12 tölustafir) — bankinn hafnar fyrirspurn án Account."); process.exit(1); }

// VILLA LÖGUÐ 6.8: body-elementið á að vera í .../Accounts (elementFormDefault=qualified skv.
// lifandi WSDL) — án þess afserjalar bankinn Query=null → villa 1000/14000 "Object reference not set".
// SOAPAction er hins vegar ÁN /Accounts (wsaw:Action í WSDL).
const ANS = "http://IcelandicOnlineBanking/2013/10/15/Accounts";
const ACTION = "http://IcelandicOnlineBanking/2013/10/15/GetAccountStatement";
const AT = "http://IcelandicOnlineBanking/2013/10/15/AccountTypes";
const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const PW = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const iso = (d) => d.toISOString().slice(0, 10);
const to = new Date(), from = new Date(Date.now() - 7 * 864e5);

const envelope =
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:at="${AT}">` +
  `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="${WSSE}">` +
  `<wsse:UsernameToken><wsse:Username>${esc(user)}</wsse:Username>` +
  `<wsse:Password Type="${PW}">${esc(pass)}</wsse:Password></wsse:UsernameToken>` +
  `</wsse:Security></s:Header>` +
  `<s:Body><GetAccountStatement xmlns="${ANS}"><Query>` +
  `<at:Account>${esc(account)}</at:Account>` +
  `<at:DateFrom>${iso(from)}</at:DateFrom><at:DateTo>${iso(to)}</at:DateTo>` +
  `<at:RecordFrom>1</at:RecordFrom><at:RecordTo>50</at:RecordTo>` +
  `</Query></GetAccountStatement></s:Body></s:Envelope>`;

const r = await fetch("http://localhost/Temporary_Listen_Addresses/hkbridge/StatementService", {
  method: "POST",
  headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${ACTION}"` },
  body: envelope,
});
const text = await r.text();
console.log("HTTP:", r.status);
const has = (s) => text.includes(s);
if (has("GetAccountStatementResponse")) {
  const bal = text.match(/<(?:\w+:)?Balance>([^<]+)</)?.[1];
  const iban = text.match(/<(?:\w+:)?IBAN>([^<]+)</)?.[1];
  const txCount = (text.match(/<(?:\w+:)?Transaction>/g) || []).length;
  console.log("✓✓✓ GetAccountStatementResponse frá BANKANUM gegnum HK-brúna!");
  console.log("  Staða reiknings:", bal ?? "(fannst ekki)", "| IBAN endar á:", iban ? "…" + iban.slice(-4) : "?", "| færslur síðustu 7 daga:", txCount);
} else if (has("faultstring")) {
  console.log("SOAP FAULT:", text.match(/<faultstring>([\s\S]{0,300}?)<\/faultstring>/)?.[1]);
} else {
  console.log("Óvænt svar (fyrstu 300):", text.slice(0, 300));
}
