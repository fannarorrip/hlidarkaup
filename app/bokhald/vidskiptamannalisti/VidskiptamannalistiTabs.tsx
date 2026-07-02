"use client";
import { useState } from "react";
import Link from "next/link";
import CustomersTable from "./CustomersTable";
import { kr } from "@/lib/format";
import type { CustomerRow, SupplierRow } from "@/lib/accounting-queries";

// Tabbed view so the two registers are switchable instantly (the customer list is long,
// so stacking them buried the lánadrottnar section). Includes a quick name/kennitala filter.
export default function VidskiptamannalistiTabs({ customers, suppliers }: { customers: CustomerRow[]; suppliers: SupplierRow[] }) {
  const [tab, setTab] = useState<"c" | "s">("c");
  const [q, setQ] = useState("");

  const match = (name: string, kt: string | null) =>
    !q.trim() || name.toLowerCase().includes(q.toLowerCase()) || (kt ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""));
  const fc = customers.filter((c) => match(c.name, c.kennitala));
  const fs = suppliers.filter((s) => match(s.name, s.kennitala));

  const Tab = ({ id, label, n }: { id: "c" | "s"; label: string; n: number }) => (
    <button onClick={() => setTab(id)}
      className={`px-4 py-2 text-sm font-medium rounded-lg ${tab === id ? "bg-red-600 text-white" : "bg-white border border-gray-300 text-gray-600 hover:bg-gray-50"}`}>
      {label} <span className={tab === id ? "opacity-80" : "text-gray-400"}>({n})</span>
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Tab id="c" label="Viðskiptamenn" n={customers.length} />
        <Tab id="s" label="Lánadrottnar" n={suppliers.length} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Leita eftir nafni eða kennitölu…"
          className="flex-1 min-w-[14rem] max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
        <Link href={tab === "c" ? "/bokhald/solukerfi/vidskiptamenn" : "/bokhald/solukerfi/birgjar"}
          className="text-sm text-red-700 hover:underline ml-auto">Umsjón →</Link>
      </div>

      {tab === "c" ? (
        <>
          <p className="text-xs text-gray-400 mb-2">Skuldunautar — viðskiptavinir sem skulda okkur ({fc.length}{q ? ` af ${customers.length}` : ""})</p>
          <CustomersTable customers={fc} />
        </>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-2">Lánadrottnar — birgjar sem við skuldum ({fs.length}{q ? ` af ${suppliers.length}` : ""})</p>
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Nafn</th>
                  <th className="px-4 py-2 font-medium">Kennitala</th>
                  <th className="px-4 py-2 font-medium">Sími</th>
                  <th className="px-4 py-2 font-medium">Netfang</th>
                  <th className="px-4 py-2 font-medium text-right">Staða (skuld)</th>
                </tr>
              </thead>
              <tbody>
                {fs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">Engir lánadrottnar{q ? " fundust" : " enn"}</td></tr>
                ) : fs.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-800">{s.name}</td>
                    <td className="px-4 py-2 font-mono text-gray-600">{s.kennitala ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{s.phone ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{s.email ?? "—"}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{kr(s.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
