// Standalone probe of the inExchange SEND service (InvoiceService.svc).
// Calls ONLY non-mutating methods: HelloWorld (no auth) + IsRecipient (read-only).
// Does NOT call InvoiceToInExchange. Reads creds from .env.local. Run: node scripts/verify-inexchange-send.js
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const USER = env.INEXCHANGE_USERNAME || "";
const PASS = env.INEXCHANGE_PASSWORD || "";
const RECEIVER = env.INEXCHANGE_RECEIVER_ID || "6507250420";
const PROD = "https://ws.inexchange.is/InvoiceService/InExchange.InvoiceService.InvoiceService.svc";
const TEST = "https://ws-test.inexchange.is/InvoiceService/InExchange.InvoiceService.InvoiceService.svc";
const NS = "http://inexchange.com";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

async function soap(url, method, inner) {
  const env_ =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><${method} xmlns="${NS}">${inner}</${method}></soap:Body></soap:Envelope>`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${NS}/IInvoiceService/${method}"` },
    body: env_,
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}
const unwrap = (text, method) => {
  const p = parser.parse(text);
  const body = p?.Envelope?.Body ?? {};
  return body[`${method}Response`] ?? body;
};

async function run(label, url) {
  console.log(`\n===== ${label}: ${url} =====`);
  try {
    const h = await soap(url, "HelloWorld", "");
    console.log("HelloWorld:", h.status, "->", JSON.stringify(unwrap(h.text, "HelloWorld")).slice(0, 160));
  } catch (e) { console.log("HelloWorld ERROR", e.message); }
  try {
    const r = await soap(url, "IsRecipient",
      `<Username>${esc(USER)}</Username><Password>${esc(PASS)}</Password>` +
      `<ReceiverPartyIdentifier>${esc(RECEIVER)}</ReceiverPartyIdentifier><ReceiverPartyIdentifierType>IS_KT</ReceiverPartyIdentifierType>`);
    console.log("IsRecipient(self):", r.status, "->", JSON.stringify(unwrap(r.text, "IsRecipient")).slice(0, 300));
    if (!r.ok) console.log("  raw:", r.text.slice(0, 400));
  } catch (e) { console.log("IsRecipient ERROR", e.message); }
}

(async () => {
  console.log("creds:", { user: USER, passSet: PASS.length > 0, receiver: RECEIVER });
  await run("PROD", PROD);
  await run("TEST", TEST);
})();
