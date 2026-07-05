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
  journal: "Dagbók",
  reversal: "Bakfærsla",
  payment: "Greiðsla",
  receipt: "Innborgun",
};
export const vType = (t: string) => VOUCHER_TYPE_LABEL[t] ?? t;

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
