// Icelandic VAT (VSK) settlement periods — bi-monthly (almenn skil). Pure, no pg.
// Skiladagur (eindagi) = 5th of the second month after the period ends
// (jan–feb → 5 Apr, mar–apr → 5 Jún, … nóv–des → 5 Feb next year).
export interface VatPeriod {
  key: number;         // 1..6
  label: string;       // "Mars – Apríl"
  from: string;        // YYYY-MM-DD (first day of first month)
  to: string;          // YYYY-MM-DD (last day of second month)
  due: string;         // YYYY-MM-DD skiladagur
}

const DEFS: { key: number; m: [number, number]; label: string }[] = [
  { key: 1, m: [1, 2], label: "Janúar – Febrúar" },
  { key: 2, m: [3, 4], label: "Mars – Apríl" },
  { key: 3, m: [5, 6], label: "Maí – Júní" },
  { key: 4, m: [7, 8], label: "Júlí – Ágúst" },
  { key: 5, m: [9, 10], label: "September – Október" },
  { key: 6, m: [11, 12], label: "Nóvember – Desember" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (year: number, month1: number) => new Date(year, month1, 0).getDate(); // month1 is 1-based

export function vatPeriods(year: number): VatPeriod[] {
  return DEFS.map((d) => {
    const [m0, m1] = d.m;
    const dueMonth = m1 + 2;
    const dueYear = dueMonth > 12 ? year + 1 : year;
    const dm = ((dueMonth - 1) % 12) + 1;
    return {
      key: d.key,
      label: d.label,
      from: `${year}-${pad(m0)}-01`,
      to: `${year}-${pad(m1)}-${pad(lastDay(year, m1))}`,
      due: `${dueYear}-${pad(dm)}-05`,
    };
  });
}

/** The period whose months contain the given date (defaults reasonably for the picker). */
export function currentVatPeriod(year: number, month1to12: number): number {
  return Math.ceil(month1to12 / 2);
}
