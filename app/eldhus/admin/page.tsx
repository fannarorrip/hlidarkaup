import { getStaffSession } from "@/lib/staff-auth-server";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { eldhusAdminEnabled } from "@/lib/eldhus-admin";
import AdminClient from "./AdminClient";

// SVO GOTT stjórnborð — runs entirely on the staff session (middleware gates this to
// eldhus/stjornandi). The old second Supabase login is gone: data flows through
// /api/eldhus/admin using the service-role key server-side.
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const s = await getStaffSession();
  const role = (s?.role ?? "") as Role;
  return (
    <AdminClient
      email={s?.email ?? ""}
      roleLabel={ROLE_LABEL[role] ?? "—"}
      enabled={eldhusAdminEnabled()}
    />
  );
}
