import { listEmployees, getUnions } from "@/lib/accounting-queries";
import LaunthegarManager from "./LaunthegarManager";

export const dynamic = "force-dynamic";

export default async function LaunthegarPage() {
  const [employees, unions] = await Promise.all([listEmployees(false), getUnions()]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Launþegar</h1>
      <p className="text-sm text-gray-500 mb-6">Starfsmannaskrá fyrir laun — kjör, lífeyrissjóður, stéttarfélag</p>
      <LaunthegarManager employees={employees} unions={unions} />
    </div>
  );
}
