// Býr til SKJAL fyrir Arion: nákvæm request + response af GetAccountStatement gegnum HK-brúna,
// með lykilorðið FJARLÆGT úr afritinu (eins og Kristján bað um). Prentar ALDREI nein gildi í
// console — bara HTTP-stöðu, villukóða og slóð skjalsins. Skjalið (arion-wire-*.txt) er í
// .gitignore og fer aldrei á GitHub.
//
// Keyrsla (á vélinni þar sem hk-bridge keyrir, í deploy/hk-bridge):
//   node _dump-statement-wire.mjs
import fs from "node:fs";
const env = fs.readFileSync("C:/Projects/hlidarkaup/.env.local", "utf8");
const get = (k) => { const m = env.match(new RegExp(`^\\s*${k}=(.*)$`, "m")); return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""; };
const user = get("ARION_B2B_USERNAME") || get("ARION_USERNAME");
const pass = get("ARION_B2B_PASSWORD") || get("ARION_PASSWORD");
const account = (get("ARION_B2B_DEBIT_ACCOUNT") || "").replace(/\D/g, "");
if (!user || !pass) { console.log("VANTAR ARION_B2B_USERNAME/PASSWORD í .env.local"); process.exit(1); }

const A = "http://IcelandicOnlineBanking/2013/10/15";
const AT = "http://IcelandicOnlineBanking/2013/10/15/AccountTypes";
const WSSE = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd";
const PW = "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const iso = (d) => d.toISOString().slice(0, 10);
const to = new Date(), from = new Date(Date.now() - 7 * 864e5);
const action = `${A}/GetAccountStatement`;

const envelope =
  `<?xml version="1.0" encoding="utf-8"?>` +
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:at="${AT}">` +
  `<s:Header><wsse:Security s:mustUnderstand="1" xmlns:wsse="${WSSE}">` +
  `<wsse:UsernameToken><wsse:Username>${esc(user)}</wsse:Username>` +
  `<wsse:Password Type="${PW}">${esc(pass)}</wsse:Password></wsse:UsernameToken>` +
  `</wsse:Security></s:Header>` +
  `<s:Body><GetAccountStatement xmlns="${A}"><Query>` +
  (account.length === 12 ? `<at:Account>${esc(account)}</at:Account>` : "") +
  `<at:DateFrom>${iso(from)}</at:DateFrom><at:DateTo>${iso(to)}</at:DateTo>` +
  `<at:RecordFrom>1</at:RecordFrom><at:RecordTo>50</at:RecordTo>` +
  `</Query></GetAccountStatement></s:Body></s:Envelope>`;

const bridgeUrl = process.env.HKBRIDGE_URL || "http://localhost/Temporary_Listen_Addresses/hkbridge/StatementService";
let r, text;
try {
  r = await fetch(bridgeUrl, {
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${action}"` },
    body: envelope,
  });
  text = await r.text();
} catch (e) {
  console.log("Næ ekki sambandi við HK-brúna — er hk-bridge.exe í gangi? (", e.message, ")");
  process.exit(1);
}

// Lykilorðið FJARLÆGT úr afritinu; létt línuskipting svo bankinn eigi auðvelt með lesturinn.
const pretty = (xml) => xml.replace(/></g, ">\n<");
const sanitized = envelope.split(esc(pass)).join("***FJARLÆGT — lykilorð notandans***");
const stamp = new Date().toISOString();
const out =
  `Arion B2B — GetAccountStatement wire-afrit (lykilorð fjarlægt)\n` +
  `Tími: ${stamp}\n` +
  `Þjónusta: https://ws.b2b.is/Statements/20131015/AccountService.svc (gegnum B2B Bridge, ClearUsernameBinding)\n` +
  `SOAPAction: ${action}\n` +
  `\n===================== REQUEST =====================\n${pretty(sanitized)}\n` +
  `\n===================== RESPONSE (HTTP ${r.status}) =====================\n${pretty(text)}\n`;
const outPath = `arion-wire-GetAccountStatement-${stamp.slice(0, 10)}.txt`;
fs.writeFileSync(outPath, out, "utf8");

const code = (t) => text.match(new RegExp(`<(?:\\w+:)?${t}>([^<]*)<`))?.[1];
console.log("HTTP:", r.status);
if (text.includes("GetAccountStatementResponse")) console.log("✓ Þjónustan SVARAR EÐLILEGA núna — yfirlit kom til baka (sjá skjalið).");
else console.log("Villukóðar í svari — GeneralErrorCode:", code("GeneralErrorCode") ?? "?", "| BanksErrorCode:", code("BanksErrorCode") ?? "?");
console.log("Skjalið tilbúið fyrir Arion:", outPath, "(request + response, lykilorð fjarlægt — yfirfarðu samt áður en þú sendir)");
