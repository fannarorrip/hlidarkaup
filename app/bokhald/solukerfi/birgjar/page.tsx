import { getSuppliers } from "@/lib/accounting-queries";
import BirgjarManager from "./BirgjarManager";

export const dynamic = "force-dynamic";

export default async function BirgjarPage() {
  const suppliers = await getSuppliers();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Birgjar</h1>
      <p className="text-sm text-gray-500 mb-6">Lánadrottnaskrá — staða hvers birgis er hluti af lykli 9300 (Lánadrottnar). Reikningar tengjast birgi við bókun.</p>
      <BirgjarManager suppliers={suppliers} />
    </div>
  );
}
