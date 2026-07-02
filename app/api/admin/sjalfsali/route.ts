import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getStaffSession } from "@/lib/staff-auth-server";

const FILE = path.join(process.cwd(), "sjalfsali-applications.json");

// GET/PATCH expose applicant PII and must be staff-only. POST is the PUBLIC application form,
// so it stays open (can't blanket-gate this path in middleware without breaking submissions).
const STAFF_ROLES = ["stjornandi", "afgreidsla", "eldhus"];
async function requireStaff() {
  const s = await getStaffSession();
  return s && STAFF_ROLES.includes(s.role);
}

function readApps() {
  try {
    if (!fs.existsSync(FILE)) return [];
    return JSON.parse(fs.readFileSync(FILE, "utf-8"));
  } catch { return []; }
}

function saveApp(app: object) {
  const apps = readApps();
  apps.push(app);
  fs.writeFileSync(FILE, JSON.stringify(apps, null, 2), "utf-8");
}

export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: "Innskráning starfsmanns krafist" }, { status: 401 });
  const apps = readApps();
  apps.sort((a: { createdAt: string }, b: { createdAt: string }) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  return NextResponse.json(apps);
}

export async function POST(req: NextRequest) {
  const { name, phone, age } = await req.json();
  if (!name || !phone || !age) return NextResponse.json({ error: "Vantar upplýsingar" }, { status: 400 });
  const app = { id: `SJ-${Date.now()}`, createdAt: new Date().toISOString(), name, phone, age, status: "new" };
  saveApp(app);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: "Innskráning starfsmanns krafist" }, { status: 401 });
  const { id, status } = await req.json();
  const apps = readApps() as Array<{ id: string; status: string }>;
  const idx = apps.findIndex((a) => a.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });
  apps[idx].status = status;
  fs.writeFileSync(FILE, JSON.stringify(apps, null, 2), "utf-8");
  return NextResponse.json(apps[idx]);
}
