// Standalone inExchange connectivity + auth check. Reads creds from .env.local (never inline).
// Run: node scripts/verify-inexchange.js
const fs = require("fs");
const path = require("path");
const { XMLParser } = require("fast-xml-parser");

// --- tiny .env.local loader (only INEXCHANGE_* needed) ---
const env = {};
for (const line of fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const C = {
  url: env.INEXCHANGE_RECEIVE_URL || "https://ws.inexchange.is/OutgoingInvoices/sksk.asmx",
  user: env.INEXCHANGE_USERNAME || "",
  pass: env.INEXCHANGE_PASSWORD || "",
  receiver: env.INEXCHANGE_RECEIVER_ID || "",
  standard: env.INEXCHANGE_STANDARD || "",
  txnType: env.INEXCHANGE_TRANSACTION_TYPE || "",
};
const NS = "http://skhub.transactions/";
const ACTION = "http://www.InExchange.is/";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const parser = new XMLParser({ ignoreAttributes: true, removeNSPrefix: true, parseTagValue: false, trimValues: true });

async function soap(method, inner) {
  const envelope =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body><${method} xmlns="${NS}">${inner}</${method}></soap:Body></soap:Envelope>`;
  const res = await fetch(C.url, {
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8", SOAPAction: `"${ACTION}${method}"` },
    body: envelope,
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}
const authXml = `<Authorization>${esc(C.user)}</Authorization><AuthorizationKey>${esc(C.pass)}</AuthorizationKey>`;
const unwrap = (text, method) => {
  const p = parser.parse(text);
  const body = p?.Envelope?.Body ?? {};
  return body[`${method}Response`] ?? body;
};

(async () => {
  console.log("Config:", { url: C.url, user: C.user, receiver: C.receiver, passSet: C.pass.length > 0, standard: C.standard || "(all)", txnType: C.txnType || "(all)" });

  // 1) Ping — no auth, proves reachability
  console.log("\n[1] Ping ...");
  try {
    const r = await soap("Ping", "");
    console.log("  HTTP", r.status, "->", JSON.stringify(unwrap(r.text, "Ping")).slice(0, 200));
  } catch (e) { console.log("  ERROR", e.message); }

  // 2) GetTransactionList — real auth test
  console.log("\n[2] GetTransactionList (auth) ...");
  try {
    const r = await soap("GetTransactionList",
      `<ReceiverPartyIdentifier>${esc(C.receiver)}</ReceiverPartyIdentifier><Standard>${esc(C.standard)}</Standard><TransactionType>${esc(C.txnType)}</TransactionType>${authXml}`);
    console.log("  HTTP", r.status);
    const ret = (unwrap(r.text, "GetTransactionList") || {}).return ?? {};
    const lines = Array.isArray(ret.lines) ? ret.lines : ret.lines == null ? [] : [ret.lines];
    console.log("  errorCode:", JSON.stringify(ret.errorCode ?? ""), "errorMessage:", JSON.stringify(ret.errorMessage ?? ""));
    console.log("  transactions:", lines.length);
    if (lines.length) console.log("  first line (shape check):", JSON.stringify(lines[0]).slice(0, 200));
    else console.log("  raw (first 600 chars):\n", r.text.slice(0, 600));
  } catch (e) { console.log("  ERROR", e.message); }
})();
