import Link from "next/link";
import { query } from "@/lib/db";
import MonthSheet from "./MonthSheet";

export const dynamic = "force-dynamic";

// Mánaðarblað starfsmanns: allur mánuðurinn dag fyrir dag — stimplanir, leiðréttingar,
// veikindi/orlof/fjarvistir. Aðgangur: stjórnandi + bókari (middleware /bokhald/timar).
export default async function TimarStarfsmannsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const emp = (await query<{ id: string; name: string }>(`select id, name from acc.employees where id = $1`, [id]))[0];
  if (!emp) {
    return (
      <div>
        <p className="text-gray-500">Starfsmaður fannst ekki.</p>
        <Link href="/bokhald/timar" className="text-red-600 hover:underline text-sm">← Tímar</Link>
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold">{emp.name}</h1>
        <Link href="/bokhald/timar" className="text-sm text-red-600 hover:underline">← Allir tímar</Link>
      </div>
      <p className="text-sm text-gray-500 mb-5">Mánaðarblað — stimplanir, leiðréttingar og fjarvistir dag fyrir dag.</p>
      <MonthSheet employeeId={emp.id} />
    </div>
  );
}
