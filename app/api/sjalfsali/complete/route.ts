import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createUnifiUser, uploadUnifiAvatar, addFaceCredential, deleteUnifiUser, FaceNotRecognizedError } from "@/lib/unifi";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const pendingCookie = cookieStore.get("sjalfsali_pending")?.value;

  if (!pendingCookie) {
    return NextResponse.json({ error: "Þú þarft að staðfesta þig með rafrænum skilríkjum fyrst." }, { status: 401 });
  }

  let identity: { name: string; kennitala: string; age: number; email?: string };
  try {
    identity = JSON.parse(Buffer.from(pendingCookie, "base64").toString());
  } catch {
    return NextResponse.json({ error: "Ógild gögn." }, { status: 400 });
  }

  const formData = await req.formData();
  const selfie = formData.get("selfie") as File | null;

  if (!selfie) return NextResponse.json({ error: "Vantar mynd." }, { status: 400 });
  if (!selfie.type.startsWith("image/")) return NextResponse.json({ error: "Skráin verður að vera mynd." }, { status: 400 });

  const photoBuffer = Buffer.from(await selfie.arrayBuffer());
  const mimeType = selfie.type;

  const parts = identity.name.trim().split(" ");
  const firstName = parts.slice(0, -1).join(" ") || parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";

  let unifiUserId: string | null = null;
  let createdNewUser = false;
  let unifiError: string | null = null;

  try {
    const { user, created } = await createUnifiUser({
      firstName,
      lastName,
      kennitala: identity.kennitala,
      email: identity.email,
    });
    unifiUserId = user.id;
    createdNewUser = created;

    // Register face credential — this is the door unlock method.
    // Throws FaceNotRecognizedError if no face is detected in the photo.
    await addFaceCredential(unifiUserId, photoBuffer, mimeType);

    // Also set as profile avatar for admin records (non-critical)
    await uploadUnifiAvatar(unifiUserId, photoBuffer, mimeType).catch(() => null);
  } catch (err) {
    if (err instanceof FaceNotRecognizedError) {
      // Photo unusable — user must retake. Remove the user only if we just
      // created it, so a retry doesn't leave a faceless duplicate behind.
      if (unifiUserId && createdNewUser) await deleteUnifiUser(unifiUserId);
      return NextResponse.json(
        { error: "Andlit fannst ekki á myndinni. Taktu mynd aftur með andlitið skýrt í mynd og góða lýsingu." },
        { status: 422 },
      );
    }
    unifiError = err instanceof Error ? err.message : String(err);
    console.error("UniFi registration failed:", unifiError);
  }

  await fetch(`${req.nextUrl.origin}/api/admin/sjalfsali`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: identity.name,
      phone: "",
      age: identity.age,
      kennitala: identity.kennitala,
      unifiUserId,
      status: unifiUserId && !unifiError ? "active" : "pending",
    }),
  }).catch(() => null);

  cookieStore.delete("sjalfsali_pending");

  return NextResponse.json({
    success: true,
    unifiRegistered: !!unifiUserId && !unifiError,
    ...(unifiError ? { warning: "Aðgangur verður virkjaður handvirkt. Við munum hafa samband." } : {}),
  });
}
