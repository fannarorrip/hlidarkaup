import { getUnions, getUnionFundsAll } from "@/lib/accounting-queries";
import UnionsManager from "./UnionsManager";

export const dynamic = "force-dynamic";

export default async function StettarfelogPage() {
  const [unions, funds] = await Promise.all([getUnions(), getUnionFundsAll()]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Stéttarfélög</h1>
      <p className="text-sm text-gray-500 mb-6">Gjaldliðir hvers stéttarfélags (félagsgjald, sjóðir) og uppbætur. Launþegar tengjast stéttarfélagi.</p>
      <UnionsManager unions={unions} funds={funds} />
    </div>
  );
}
