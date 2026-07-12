import type { ReactNode } from "react";
import Link from "next/link";
import BokhaldNav from "./BokhaldNav";
import LogoutButton from "./LogoutButton";
import Assistant from "./Assistant";
import { getStaffSession } from "@/lib/staff-auth-server";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { getPendingEmailCount } from "@/lib/accounting-queries";

export default async function BokhaldLayout({ children }: { children: ReactNode }) {
  const s = await getStaffSession();
  const role = (s?.role ?? "") as Role;
  const pendingEmail = await getPendingEmailCount().catch(() => 0);
  const initial = (s?.email?.[0] ?? "?").toUpperCase();

  return (
    <div className="min-h-screen bg-[#FFF6F6] text-[#21323A]">
      <header className="sticky top-0 z-50 bg-[#2C687B] shadow-md shadow-[#2C687B]/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <Link href="/bokhald" className="flex items-baseline gap-2 shrink-0" title="Bókhald — yfirlit">
                <span className="text-white font-extrabold text-lg tracking-tight">Hlíðarkaup<span className="text-[#DB1A1A]">.</span></span>
                <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wider text-[#8CC7C4]">Bókhald</span>
              </Link>
              <BokhaldNav role={role} pendingEmail={pendingEmail} />
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/starf" title={`${s?.email ?? ""} · ${ROLE_LABEL[role] ?? "—"} — starfsmannakerfi`}
                className="hidden md:flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                <span className="w-6 h-6 rounded-full bg-[#DB1A1A] flex items-center justify-center text-[11px] font-bold text-white">{initial}</span>
                <span className="text-xs text-[#E4F1F0] max-w-[12rem] truncate">{ROLE_LABEL[role] ?? "—"}</span>
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
      <Assistant />
    </div>
  );
}
