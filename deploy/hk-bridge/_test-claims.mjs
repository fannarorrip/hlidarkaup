// Live READ-ONLY test of hk-bridge ClaimService: QueryClaims (Unpaid, PrimaryCollection) for our kt.
// Proves the crypto channel + auth end-to-end without touching anything. Never prints credentials.
import fs from "node:fs";
const env = fs.readFileSync("C:/Projects/hlidarkaup/.env.local", "utf8");
const get = (k) => { const m = env.match(new RegExp(`^\\s*${k}=(.*)$`, "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
const user = get("ARION_B2B_USERNAME") || get("ARION_USERNAME");
const pass = get("ARION_B2B_PASSWORD") || get("ARION_PASSWORD");
const kt = (get("ARION_B2B_PAYOR_ID") || get("ARION_PSU_ID") || "6507250420").replace(/\D/g, "");
if (!user || !pass) { console.log("VANTAR ARION creds"); process.exit(1); }

const CL = "http://IcelandicOnlineBanking/2013/10/15/Claims";
const CT = "http://IcelandicOnlineBanking/2013/10/15/ClaimTypes";
const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const PW = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const envelope =
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ct="${CT}">` +
  `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="${WSSE}">` +
  `<wsse:UsernameToken><wsse:Username>${esc(user)}</wsse:Username>` +
  `<wsse:Password Type="${PW}">${esc(pass)}</wsse:Password></wsse:UsernameToken>` +
  `</wsse:Security></s:Header>` +
  `<s:Body><QueryClaims xmlns="${CL}"><Query>` +
  `<ct:Claimant>${esc(kt)}</ct:Claimant>` +
  `<ct:Status>Unpaid</ct:Status><ct:State>PrimaryCollection</ct:State>` +
  `<ct:RecordFrom>1</ct:RecordFrom><ct:RecordTo>10</ct:RecordTo>` +
  `</Query></QueryClaims></s:Body></s:Envelope>`;

const r = await fetch("http://localhost/Temporary_Listen_Addresses/hkbridge/ClaimService", {
  method: "POST",
  headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"http://IcelandicOnlineBanking/2013/10/15/QueryClaims"` },
  body: envelope,
});
const text = await r.text();
console.log("HTTP:", r.status);
if (text.includes("QueryClaimsResponse")) {
  const total = text.match(/<(?:\w+:)?TotalCount>(\d+)</)?.[1];
  const claims = (text.match(/<(?:\w+:)?Claim>/g) || []).length;
  console.log(`✓✓✓ QueryClaimsResponse frá BANKANUM gegnum HK-brúna! Ógreiddar kröfur: TotalCount=${total}, í svari=${claims}`);
} else if (text.includes("faultstring")) {
  console.log("SOAP FAULT:", text.match(/<faultstring>([\s\S]{0,300}?)<\/faultstring>/)?.[1]);
} else {
  console.log("Óvænt (fyrstu 300):", text.slice(0, 300));
}
