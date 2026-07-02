import { listStaff } from "@/lib/staff";
import StaffManager from "./StaffManager";

export const dynamic = "force-dynamic";

export default async function StarfsmennPage() {
  const staff = await listStaff();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Starfsmenn</h1>
      <p className="text-sm text-gray-500 mb-6">Notendur og hlutverk — aðeins stjórnendur</p>
      <StaffManager staff={staff} />
    </div>
  );
}
