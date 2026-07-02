import { cookies } from "next/headers";
import { verifyStaffSession, STAFF_COOKIE, type StaffSession } from "@/lib/staff-session";

/** Read + verify the staff session in a server component / route handler. */
export async function getStaffSession(): Promise<StaffSession | null> {
  const c = await cookies();
  const token = c.get(STAFF_COOKIE)?.value;
  return token ? verifyStaffSession(token) : null;
}
