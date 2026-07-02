import { NextResponse } from "next/server";
import { getProductGroups } from "@/lib/accounting-queries";

// Product categories (vöruflokkar) for the till quick-pick grid.
// The product data stores numeric group codes — map them to the real names.
export const dynamic = "force-dynamic";

const NAMES: Record<string, string> = { "10": "Aðalvalmynd", "20": "Ávextir", "30": "Grænmeti", "40": "Kál", "50": "Bakarí" };
const ORDER = ["10", "20", "30", "40", "50"];

export async function GET() {
  const groups = await getProductGroups();
  const categories = groups
    .filter((g) => g.count > 0 && g.product_group !== "(óflokkað)")
    .map((g) => ({ group: g.product_group, name: NAMES[g.product_group] ?? g.product_group, count: g.count }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.group), ib = ORDER.indexOf(b.group);
      if (ia < 0 && ib < 0) return a.name.localeCompare(b.name, "is");
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    });
  return NextResponse.json({ categories });
}
