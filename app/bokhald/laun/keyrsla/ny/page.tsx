import { listEmployees } from "@/lib/accounting-queries";
import NyKeyrsla from "./NyKeyrsla";

export const dynamic = "force-dynamic";

export default async function NyKeyrslaPage() {
  const employees = await listEmployees(true); // active only
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Ný launakeyrsla</h1>
      <p className="text-sm text-gray-500 mb-6">Veldu tímabil og skráðu tíma fyrir tímakaupsfólk. Föst laun reiknast sjálfkrafa.</p>
      <NyKeyrsla employees={employees.map((e) => ({ id: e.id, name: e.name, employment_type: e.employment_type, monthly_salary: e.monthly_salary, hourly_rate: e.hourly_rate }))} />
    </div>
  );
}
