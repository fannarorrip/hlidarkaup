import { listReminderDefs } from "@/lib/reminders";
import Dagatal from "./Dagatal";

export const dynamic = "force-dynamic";

export default async function DagatalPage() {
  const defs = await listReminderDefs().catch(() => []);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">🗓️ Dagatal & áminningar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Skiladagar skatta, pantanir og eigin áminningar. Áríðandi verkefni birtast líka á Yfirliti og senda áminningarpóst.
      </p>
      <Dagatal defs={defs} />
    </div>
  );
}
