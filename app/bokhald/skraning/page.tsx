import { getPostableAccounts, getNextJournalNumber } from "@/lib/accounting-queries";
import SkraningForm from "./SkraningForm";

export const dynamic = "force-dynamic";

export default async function SkraningPage() {
  const [accounts, nextNo] = await Promise.all([
    getPostableAccounts(["tekjur", "gjold", "eign", "skuld", "eigid_fe"]),
    getNextJournalNumber(),
  ]);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Skráning</h1>
      <p className="text-sm text-gray-500 mb-6">Dagbókarfærsla — lestu skjöl með gervigreind eða skráðu handvirkt</p>
      <SkraningForm accounts={accounts} nextSkjalanumer={nextNo} />
    </div>
  );
}
