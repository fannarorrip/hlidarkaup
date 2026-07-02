// Verifies the velta-by-channel dashboard + the universal reikningur PDF export.
// Usage: node scripts/verify-pdf-velta.js <voucherId> [<voucherId> ...]
const BASE = "http://localhost:3000";
const cookieOf = (r) => (r.headers.get("set-cookie") || "").split(";")[0];
const IDS = process.argv.slice(2);

(async () => {
  let r = await fetch(`${BASE}/api/auth/staff/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "starf", password: "hlidar-starf-2026" }),
  });
  const cookie = cookieOf(r);
  console.log("login:", r.status, cookie ? "(cookie set)" : "(NO cookie)");

  const dash = await (await fetch(`${BASE}/bokhald`, { headers: { cookie } })).text();
  console.log('dashboard "Velta í kassa":', dash.includes("Velta í kassa"));
  console.log('dashboard "Velta í sjálfsafgreiðslukassa":', dash.includes("Velta í sjálfsafgreiðslukassa"));
  console.log('dashboard "Velta í vefverslun":', dash.includes("Velta í vefverslun"));
  console.log('dashboard "Velta í eldhúsi":', dash.includes("Velta í eldhúsi"));

  const list = await (await fetch(`${BASE}/bokhald/solukerfi/reikningar`, { headers: { cookie } })).text();
  console.log("reikningar Rás column:", list.includes(">Rás<"));
  console.log("reikningar PDF link:", /\/api\/reikningur\/[0-9a-f-]{36}\/pdf/.test(list));

  for (const id of IDS) {
    const pr = await fetch(`${BASE}/api/reikningur/${id}/pdf`, { headers: { cookie } });
    const buf = Buffer.from(await pr.arrayBuffer());
    const head = buf.slice(0, 5).toString("latin1");
    console.log(`PDF ${id.slice(0, 8)}: status=${pr.status} type=${pr.headers.get("content-type")} bytes=${buf.length} %PDF=${head === "%PDF-"}`);
  }

  const noauth = await fetch(`${BASE}/api/reikningur/${IDS[0]}/pdf`);
  console.log("PDF without auth (expect 401):", noauth.status);
})().catch((e) => { console.error("ERR", e); process.exit(1); });
