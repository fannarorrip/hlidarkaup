"use client";
import Link from "next/link";
import RafraenToggle from "./RafraenToggle";
import { kr } from "@/lib/format";
import type { CustomerRow } from "@/lib/accounting-queries";

// One client island for the whole customers table (the per-row toggle is a child here,
// not a separate island) — keeps the RSC payload small even with hundreds of rows.
export default function CustomersTable({ customers }: { customers: CustomerRow[] }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-gray-50 text-gray-500 text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Nafn</th>
            <th className="px-4 py-2 font-medium">Kennitala</th>
            <th className="px-4 py-2 font-medium">Sími</th>
            <th className="px-4 py-2 font-medium">Netfang</th>
            <th className="px-4 py-2 font-medium">Reikningsviðskipti</th>
            <th className="px-4 py-2 font-medium">Rafræn viðskipti</th>
            <th className="px-4 py-2 font-medium text-right">Staða</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-4 py-2">
                <Link href={`/bokhald/solukerfi/vidskiptamenn/${c.id}`} className="text-red-700 hover:underline">{c.name}</Link>
              </td>
              <td className="px-4 py-2 font-mono text-gray-600">{c.kennitala ?? "—"}</td>
              <td className="px-4 py-2 text-gray-600">{c.phone ?? "—"}</td>
              <td className="px-4 py-2 text-gray-600">{c.email ?? "—"}</td>
              <td className="px-4 py-2 text-gray-500">{c.is_account ? "Já" : "—"}</td>
              <td className="px-4 py-2">
                {c.is_generic ? <span className="text-gray-400">—</span>
                  : <RafraenToggle id={c.id} initial={c.rafraen_vidskipti} hasKennitala={!!c.kennitala} />}
              </td>
              <td className="px-4 py-2 text-right text-gray-700">{kr(c.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
