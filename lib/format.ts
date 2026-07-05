// Display helpers (Icelandic formatting). Thousands separator = dot, decimal = comma —
// applied explicitly so the result is identical on the server and in the browser (browser
// ICU for is-IS otherwise renders a comma thousands separator on some platforms).
const dotGroup = (intStr: string) => intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export const kr = (n: number | string) =>
  dotGroup(Math.round(Number(n)).toString()) + " kr.";

export const num = (n: number | string) => {
  const v = Number(n);
  const neg = v < 0 ? "-" : "";
  const [i, f] = Math.abs(v).toString().split(".");
  return neg + dotGroup(i) + (f ? "," + f : "");
};

/** Icelandic date, e.g. 5.7.2026. Accepts Date, ISO timestamp or date-only string. */
export const dags = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const dt = typeof d === "string" ? new Date(d.length === 10 ? d + "T00:00:00" : d) : d;
  if (isNaN(dt.getTime())) return String(d);
  return `${dt.getDate()}.${dt.getMonth() + 1}.${dt.getFullYear()}`;
};

/** Icelandic month names (nominative, lower-case) for chart axes and pickers. */
export const MANUDIR = ["janúar", "febrúar", "mars", "apríl", "maí", "júní", "júlí", "ágúst", "september", "október", "nóvember", "desember"];

// VSK-flokkur letters shown on invoices/receipts: A = 24%, B = 11%, C = 0%.
export const vatLetter = (rate: number | string) => {
  const r = Number(rate);
  return r === 24 ? "A" : r === 11 ? "B" : r === 0 ? "C" : "";
};

export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  eign: "Eign",
  skuld: "Skuld",
  eigid_fe: "Eigið fé",
  tekjur: "Tekjur",
  gjold: "Gjöld",
};

export const VOUCHER_TYPE_LABEL: Record<string, string> = {
  kassi_sale: "Kassasala",
  account_sale: "Reikningssala",
  web_sale: "Netsala",
  eldhus_sale: "Eldhússala",
  sales_invoice: "Sölureikningur",
  credit_note: "Kreditreikningur",
  purchase: "Innkaup",
  purchase_return: "Skil til birgja",
  journal: "Dagbók",
  reversal: "Bakfærsla",
  payment: "Greiðsla",
  receipt: "Innborgun",
  card_purchase: "Kreditkort",
  payroll: "Laun",
};
export const vType = (t: string) => VOUCHER_TYPE_LABEL[t] ?? t;

// Icelandic display prefixes for the voucher series — the DB keys stay English (they're
// referenced by code), only what humans see changes: INN-000016 instead of PURCHASE-16.
export const SERIES_PREFIX: Record<string, string> = {
  JOURNAL: "DB",    // dagbók
  KASSI: "HK",      // kassasala — same prefix as printed receipts
  SALES: "SR",      // sölureikningur
  CREDIT: "KR",     // kreditreikningur
  PURCHASE: "INN",  // innkaup
  PAYROLL: "LN",    // laun
};

/** Voucher number as displayed everywhere: HK-000123, INN-000016, DB-000009… */
export const vNr = (series: string, num: number | string | null | undefined) =>
  `${SERIES_PREFIX[series] ?? series}-${String(num ?? "").padStart(6, "0")}`;

// Sales channel (voucher source) labels.
export const SOURCE_LABEL: Record<string, string> = {
  till: "Kassi",
  kiosk: "Sjálfsafgreiðsla",
  web: "Vefverslun",
  eldhus: "Eldhús",
};
export const sourceLabel = (s?: string | null) => (s ? SOURCE_LABEL[s] ?? s : "—");

export const STATUS_LABEL: Record<string, string> = {
  posted: "Bókað",
  reversed: "Bakfært",
  draft: "Drög",
};
