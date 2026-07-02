import { getAccounts } from "@/lib/accounting-queries";
import AccountsTree from "./AccountsTree";

export const dynamic = "force-dynamic";

export default async function LyklarPage() {
  const accounts = await getAccounts();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Bókhaldslyklar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Reikningaskipan ({accounts.length} lyklar) — smelltu á yfirlykil til að opna undirlykla
      </p>
      <AccountsTree accounts={accounts} />
    </div>
  );
}
