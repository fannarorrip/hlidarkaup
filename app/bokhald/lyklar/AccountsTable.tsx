"use client";
import { useState } from "react";
import type { AccountRow } from "@/lib/accounting-queries";
import { kr, ACCOUNT_TYPE_LABEL } from "@/lib/format";

const TYPES = ["all", "tekjur", "gjold", "eign", "skuld", "eigid_fe"];

export default function AccountsTable({ accounts }: { accounts: AccountRow[] }) {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");

  const filtered = accounts.filter((a) => {
    if (type !== "all" && a.account_type !== type) return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return a.account_number.toLowerCase().includes(s) || a.name.toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Leita að lykli eða heiti…"
          className="flex-1 min-w-[16rem] border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>{t === "all" ? "Allar tegundir" : ACCOUNT_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>

      <p className="text-xs text-gray-400 mb-2">{filtered.length} lyklar</p>
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead className="bg-gray-50 text-gray-500 text-left sticky top-0">
            <tr>
              <th className="px-4 py-2 font-medium">Lykill</th>
              <th className="px-4 py-2 font-medium">Heiti</th>
              <th className="px-4 py-2 font-medium">Tegund</th>
              <th className="px-4 py-2 font-medium text-right">VSK</th>
              <th className="px-4 py-2 font-medium text-right">Staða</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const bal = Number(a.balance);
              return (
                <tr key={a.account_number} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-gray-700">{a.account_number}</td>
                  <td className={`px-4 py-2 ${a.is_postable ? "" : "font-semibold text-gray-900"}`}>{a.name}</td>
                  <td className="px-4 py-2 text-gray-500">{ACCOUNT_TYPE_LABEL[a.account_type]}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{a.vat_rate ? `${Number(a.vat_rate)}%` : "—"}</td>
                  <td className="px-4 py-2 text-right font-medium">{bal !== 0 ? kr(bal) : <span className="text-gray-300">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
