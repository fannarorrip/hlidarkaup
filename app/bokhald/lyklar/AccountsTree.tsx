"use client";
import { useState } from "react";
import type { AccountRow } from "@/lib/accounting-queries";
import { kr, ACCOUNT_TYPE_LABEL } from "@/lib/format";

export default function AccountsTree({ accounts }: { accounts: AccountRow[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  const childrenByParent = new Map<string | null, AccountRow[]>();
  for (const a of accounts) {
    const k = a.parent_number;
    if (!childrenByParent.has(k)) childrenByParent.set(k, []);
    childrenByParent.get(k)!.push(a);
  }
  const hasKids = (n: string) => (childrenByParent.get(n)?.length ?? 0) > 0;
  const toggle = (n: string) =>
    setOpen((p) => { const s = new Set(p); s.has(n) ? s.delete(n) : s.add(n); return s; });

  type Visible = { a: AccountRow; depth: number };
  const visible: Visible[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const a of childrenByParent.get(parent) ?? []) {
      visible.push({ a, depth });
      if (hasKids(a.account_number) && open.has(a.account_number)) walk(a.account_number, depth + 1);
    }
  };
  walk(null, 0);

  const searching = q.trim().length > 0;
  const flat = searching
    ? accounts.filter((a) =>
        a.account_number.toLowerCase().includes(q.toLowerCase()) ||
        a.name.toLowerCase().includes(q.toLowerCase()))
    : [];

  const rows = searching ? flat.map((a) => ({ a, depth: 0 })) : visible;

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-center">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Leita að lykli eða heiti…"
          className="flex-1 min-w-[14rem] border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400"
        />
        {!searching && (
          <>
            <button onClick={() => setOpen(new Set(accounts.filter((a) => hasKids(a.account_number)).map((a) => a.account_number)))}
              className="text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50">Opna allt</button>
            <button onClick={() => setOpen(new Set())}
              className="text-sm text-gray-600 border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50">Loka öllu</button>
          </>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Lykill</th>
              <th className="px-4 py-2 font-medium">Heiti</th>
              <th className="px-4 py-2 font-medium">Tegund</th>
              <th className="px-4 py-2 font-medium text-right">VSK</th>
              <th className="px-4 py-2 font-medium text-right">Staða</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ a, depth }) => {
              const kids = !searching && hasKids(a.account_number);
              const isOpen = open.has(a.account_number);
              const bal = Number(a.balance);
              return (
                <tr
                  key={a.account_number}
                  className={`border-t border-gray-100 ${kids ? "cursor-pointer hover:bg-gray-50" : ""}`}
                  onClick={kids ? () => toggle(a.account_number) : undefined}
                >
                  <td className="px-4 py-2 font-mono text-gray-700 whitespace-nowrap" style={{ paddingLeft: 16 + depth * 18 }}>
                    <span className="inline-block w-4 text-gray-400">{kids ? (isOpen ? "▾" : "▸") : ""}</span>
                    {a.account_number}
                  </td>
                  <td className={`px-4 py-2 ${!a.is_postable ? "font-semibold text-gray-900" : ""}`}>{a.name}</td>
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
