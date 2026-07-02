// Product photos in Supabase storage (bucket "product-photos", public) — same service-role REST
// pattern as SVO GOTT meal photos (lib/eldhus-admin.ts). The bucket is created automatically on
// the first upload if it doesn't exist yet.

function cfg() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}
export const productPhotosEnabled = () => !!cfg();

const hdrs = (key: string, extra: Record<string, string> = {}) => ({
  apikey: key, authorization: `Bearer ${key}`, ...extra,
});

const BUCKET = "product-photos";

async function ensureBucket(url: string, key: string): Promise<void> {
  await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers: hdrs(key, { "content-type": "application/json" }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
  }).catch(() => {}); // 409 already-exists is fine
}

export async function uploadProductPhoto(productNumber: string, bytes: Buffer, contentType: string): Promise<{ ok: boolean; url?: string; message?: string }> {
  const c = cfg();
  if (!c) return { ok: false, message: "Supabase ekki stillt (SUPABASE_SERVICE_ROLE_KEY)." };
  const safe = productNumber.replace(/[^A-Za-z0-9_-]/g, "_");
  const ext = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${safe}-${Date.now()}.${ext}`;
  const doUpload = () => fetch(`${c.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: hdrs(c.key, { "content-type": contentType || "application/octet-stream", "x-upsert": "true" }),
    body: new Uint8Array(bytes),
  });
  let r = await doUpload();
  if (r.status === 400 || r.status === 404) { // bucket may not exist yet
    await ensureBucket(c.url, c.key);
    r = await doUpload();
  }
  if (!r.ok) return { ok: false, message: (await r.text().catch(() => "")).slice(0, 200) || `HTTP ${r.status}` };
  return { ok: true, url: `${c.url}/storage/v1/object/public/${BUCKET}/${path}` };
}

/** Best-effort removal of a previously stored photo (by its public URL). */
export async function deleteProductPhoto(publicUrl: string): Promise<void> {
  const c = cfg();
  if (!c) return;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const i = publicUrl.indexOf(marker);
  if (i < 0) return;
  const path = publicUrl.slice(i + marker.length);
  await fetch(`${c.url}/storage/v1/object/${BUCKET}/${path}`, { method: "DELETE", headers: hdrs(c.key) }).catch(() => {});
}
