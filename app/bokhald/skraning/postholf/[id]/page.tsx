import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostableAccounts, getNextJournalNumber, getEmailInvoice } from "@/lib/accounting-queries";
import SkraningForm, { type ExtractData } from "../../SkraningForm";

export const dynamic = "force-dynamic";

export default async function PostholfDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await getEmailInvoice(id);
  if (!draft) notFound();

  const [accounts, nextNo] = await Promise.all([
    getPostableAccounts(["tekjur", "gjold", "eign", "skuld", "eigid_fe"]),
    getNextJournalNumber(),
  ]);

  if (draft.status === "approved") {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2">Reikningur úr tölvupósti</h1>
        <p className="text-sm text-gray-500 mb-6">Þessi reikningur hefur þegar verið bókaður.</p>
        <div className="flex gap-3">
          {draft.voucher_id && <Link href={`/bokhald/fylgiskjol/${draft.voucher_id}`} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700">Skoða fylgiskjal</Link>}
          <Link href="/bokhald/skraning/postholf" className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50">← Til baka í pósthólf</Link>
        </div>
      </div>
    );
  }

  const initialData = (draft.extracted ?? {}) as ExtractData;
  const ex = (draft.extracted ?? {}) as { supplier?: string; supplierKennitala?: string; source?: string };
  const isEinvoice = ex.source === "inexchange" || (draft.attachment_name?.toLowerCase().endsWith(".xml") ?? false);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{isEinvoice ? "Rafrænn reikningur" : "Reikningur úr tölvupósti"}</h1>
      <p className="text-sm text-gray-500 mb-3">
        Frá {draft.from_name || draft.from_address || "óþekkt"}{draft.subject ? ` · „${draft.subject}"` : ""}. Yfirfarðu færsluna og samþykktu til að bóka.
      </p>
      {isEinvoice && (
        <a
          href={`/api/skraning/email/${draft.id}/document`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-lg text-white text-sm font-semibold hover:opacity-90"
          style={{ background: "#2C687B" }}
        >
          Skoða reikning
        </a>
      )}
      <SkraningForm
        accounts={accounts}
        nextSkjalanumer={nextNo}
        emailId={draft.id}
        initialData={initialData}
        initialDocUrl={draft.has_attachment ? `/api/skraning/email/${draft.id}/document` : undefined}
        initialDocName={draft.attachment_name ?? undefined}
        supplierName={ex.supplier}
        supplierKennitala={ex.supplierKennitala}
      />
    </div>
  );
}
