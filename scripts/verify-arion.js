// Standalone Arion B2B connection check. Reads .env.local (no inline creds), reports which
// config is present (never prints secret values), then attempts the OAuth client_credentials
// token over mTLS with the búnaðarskilríki. Run:  node scripts/verify-arion.js
const fs = require("fs");
const https = require("https");
const { randomUUID } = require("crypto");

function loadEnv(file) {
  const env = {};
  try {
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i < 0) continue;
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[line.slice(0, i).trim()] = v;
    }
  } catch (e) { console.error("cannot read", file, e.message); }
  return env;
}

const env = loadEnv(".env.local");
const c = {
  tokenUrl: env.ARION_TOKEN_URL || "https://apigw.arionbanki.is/oauth/v2/oauth-token",
  username: env.ARION_USERNAME || "",
  password: env.ARION_PASSWORD || "",
  subKey: env.ARION_SUBSCRIPTION_KEY || "",
  certPath: env.ARION_CERT_PATH || "",
  certPass: env.ARION_CERT_PASSWORD || "",
  scope: env.ARION_SCOPE || "openid b2b",
  sandbox: env.ARION_SANDBOX === "true",
};
const certFound = c.certPath ? fs.existsSync(c.certPath) : false;
console.log("Arion config (presence only — no values shown):");
console.log("  ARION_USERNAME        :", c.username ? "SET" : "(empty)");
console.log("  ARION_PASSWORD        :", c.password ? "SET" : "(empty)");
console.log("  ARION_SUBSCRIPTION_KEY:", c.subKey ? "SET" : "(empty)");
console.log("  ARION_CERT_PATH       :", c.certPath ? "SET" : "(empty)", certFound ? "(file found)" : "(FILE NOT FOUND)");
console.log("  ARION_CERT_PASSWORD   :", c.certPass ? "SET" : "(empty)");
console.log("  endpoint              :", c.tokenUrl, c.sandbox ? "[sandbox flag on]" : "");

const missing = [];
if (!c.subKey) missing.push("ARION_SUBSCRIPTION_KEY");
if (!c.username) missing.push("ARION_USERNAME (netbank user)");
if (!c.password) missing.push("ARION_PASSWORD (netbank password)");
if (!c.certPath || !certFound) missing.push("ARION_CERT_PATH (.pfx)");
if (!c.certPass) missing.push("ARION_CERT_PASSWORD");
if (missing.length) {
  console.log("\nRESULT: cannot attempt connection yet — still missing:\n  - " + missing.join("\n  - "));
  process.exit(0);
}

let pfx;
try { pfx = fs.readFileSync(c.certPath); } catch (e) { console.log("\nRESULT: cannot read cert file:", e.message); process.exit(0); }

const body = new URLSearchParams({ grant_type: "client_credentials", client_id: c.username, client_secret: c.password, scope: c.scope }).toString();
const u = new URL(c.tokenUrl);
console.log("\nAttempting OAuth token over mTLS …");
const req = https.request({
  host: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: "POST",
  pfx, passphrase: c.certPass,
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    "Ocp-Apim-Subscription-Key": c.subKey,
    "X-Request-ID": randomUUID(),
    "content-length": Buffer.byteLength(body),
  },
}, (res) => {
  let d = ""; res.on("data", (x) => (d += x));
  res.on("end", () => {
    console.log("HTTP", res.statusCode);
    try {
      const j = JSON.parse(d);
      if (j.access_token) console.log("RESULT: SUCCESS — token issued (type " + (j.token_type || "?") + ", expires_in " + (j.expires_in || "?") + "s). [token value hidden]");
      else console.log("RESULT:", JSON.stringify({ error: j.error, error_description: j.error_description, message: j.message, fault: j.fault }).slice(0, 400));
    } catch { console.log("body (first 300 chars):", d.slice(0, 300)); }
  });
});
req.on("error", (e) => console.log("RESULT: connection/TLS error:", e.message));
req.write(body); req.end();
