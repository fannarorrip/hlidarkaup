import { getTaxConfig } from "@/lib/payroll";
import { getUnions, getUnionFundsAll } from "@/lib/accounting-queries";
import Reiknivel from "./Reiknivel";

export const dynamic = "force-dynamic";

export default async function ReiknivelPage() {
  const [cfg, unions, funds] = await Promise.all([
    getTaxConfig(new Date().getFullYear()),
    getUnions(),
    getUnionFundsAll(),
  ]);
  return (
    <Reiknivel
      cfg={cfg}
      unions={unions.filter((u) => u.is_active).map((u) => ({ id: u.id, name: u.name }))}
      funds={funds
        .filter((f) => f.rate_pct != null)
        .map((f) => ({ union_id: f.union_id, payer: f.payer, fund_type: f.fund_type, rate_pct: Number(f.rate_pct) }))}
    />
  );
}
