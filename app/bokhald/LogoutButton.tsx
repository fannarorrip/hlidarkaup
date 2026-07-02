"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/staff/logout", { method: "POST" });
    router.replace("/starf/login");
    router.refresh();
  }
  return (
    <button onClick={logout} className="px-3 py-1.5 rounded-lg text-sm text-white/90 border border-white/25 hover:bg-white/10 transition-colors">
      Útskrá
    </button>
  );
}
