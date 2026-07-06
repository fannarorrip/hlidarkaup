// Public "coming soon" gate for hlidarkaup.is + the public eldhús pages.
// The webshop shows app/vinnsla (a branded splash + countdown) until we open.
//
// Behaviour:
//   • Production: auto-shows the splash until OPENS_AT, then opens by itself. No manual step.
//   • Development: OFF by default (so you can keep building the shop). Set COMING_SOON=true to preview.
//   • Override anywhere with the COMING_SOON env: "true" = force closed, "false" = force open early.
//
// Iceland runs on UTC year-round (Atlantic/Reykjavik, no DST), so this is 31 July 2026, 00:00 local.
// (Opening moved up from 1 September.)
export const OPENS_AT = new Date("2026-07-31T00:00:00Z");

export function isComingSoon(): boolean {
  const flag = process.env.COMING_SOON;
  if (flag === "false") return false; // force open
  if (flag === "true") return true; // force closed / preview
  if (process.env.NODE_ENV !== "production") return false; // dev: shop visible unless forced
  return Date.now() < OPENS_AT.getTime();
}
