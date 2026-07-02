import { NextRequest, NextResponse } from "next/server";
import { getCollectionProfiles, getCollectionSettings, saveCollectionProfile, deleteCollectionProfile, saveCollectionSettings, CollectionValidationError } from "@/lib/collection";

// Innheimtuþjónustur config: kröfusnið (collection profiles) + the agreement settings.
// Gated stjornandi via middleware (/api/bankatenging).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  const [profiles, settings] = await Promise.all([getCollectionProfiles(), getCollectionSettings()]);
  return NextResponse.json({ ok: true, profiles, settings });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  try {
    if (action === "saveProfile") {
      const res = await saveCollectionProfile(body.profile || {});
      return NextResponse.json({ ok: true, id: res.id });
    }
    if (action === "deleteProfile") {
      const id = String(body.id || "").trim();
      if (!UUID_RE.test(id)) return NextResponse.json({ ok: false, message: "Ógilt auðkenni." });
      await deleteCollectionProfile(id);
      return NextResponse.json({ ok: true });
    }
    if (action === "saveSettings") {
      await saveCollectionSettings(body.settings || {});
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, message: "Óþekkt aðgerð." });
  } catch (e) {
    if (e instanceof CollectionValidationError) return NextResponse.json({ ok: false, message: e.message });
    console.error("bankatenging/collection failed:", e);
    return NextResponse.json({ ok: false, message: "Villa við vistun." });
  }
}
