import { notFound } from "next/navigation";
import { getGoodsReceipt, getReceiptLines } from "@/lib/accounting-queries";
import ReceiptDetail from "./ReceiptDetail";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const receipt = await getGoodsReceipt(id);
  if (!receipt) notFound();
  const lines = await getReceiptLines(id);
  return <ReceiptDetail receipt={receipt} lines={lines} />;
}
