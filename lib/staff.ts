import { query } from "@/lib/db";
import type { Role, StaffRow } from "@/lib/roles";

export type { Role, StaffRow };
export { ROLE_LABEL, ROLES } from "@/lib/roles";

export const getStaffByEmail = async (email: string): Promise<StaffRow | null> =>
  (await query<StaffRow>(
    `select email, name, role, is_active from shop.staff where lower(email) = lower($1)`, [email]))[0] ?? null;

export const listStaff = () =>
  query<StaffRow>(`select email, name, role, is_active from shop.staff order by role, email`);
