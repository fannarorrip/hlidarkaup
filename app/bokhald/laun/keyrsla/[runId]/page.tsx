import { notFound } from "next/navigation";
import { getPayrollRun, getPayrollLines } from "@/lib/accounting-queries";
import RunView from "./RunView";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = await getPayrollRun(runId);
  if (!run) notFound();
  const lines = await getPayrollLines(runId);
  return <RunView run={run} lines={lines} />;
}
