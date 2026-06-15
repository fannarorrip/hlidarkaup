// Shared pickup/delivery logic — mirrors the main Hlíðarkaup checkout.
// Store: Akurhlíð 1, Sauðárkrókur.
export const STORE = { lat: 65.7460, lng: -19.6290 };

export function generateTimes(lastHour: number, lastMin: number): string[] {
  const times: string[] = [];
  for (let h = 9; h <= lastHour; h++) {
    for (const m of [0, 30]) {
      if (h === lastHour && m > lastMin) break;
      times.push(`${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`);
    }
  }
  return times;
}
export const PICKUP_TIMES = generateTimes(21, 30);
export const DELIVERY_TIMES = generateTimes(18, 30);

const IS_MONTHS = ["janúar","febrúar","mars","apríl","maí","júní","júlí","ágúst","september","október","nóvember","desember"];
const IS_WEEKDAYS = ["Sunnudagur","Mánudagur","Þriðjudagur","Miðvikudagur","Fimmtudagur","Föstudagur","Laugardagur"];
export function formatTodayIcelandic(d: Date) {
  return `${IS_WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${IS_MONTHS[d.getMonth()]}`;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Shipping cost by distance (km). null = outside delivery area. */
export function calcShipping(km: number): number | null {
  if (km <= 3) return 500;
  if (km <= 10) return 1500;
  if (km <= 20) return 3000;
  if (km <= 30) return 4500;
  if (km <= 40) return 6000;
  if (km <= 50) return 7500;
  return null;
}

export function zoneLabel(km: number): string {
  return km <= 3 ? "Innan Sauðárkróks (0–3 km)"
    : km <= 10 ? "Svæði 1 (3–10 km)"
    : km <= 20 ? "Svæði 2 (10–20 km)"
    : km <= 30 ? "Svæði 3 (20–30 km)"
    : km <= 40 ? "Svæði 4 (30–40 km)"
    : "Svæði 5 (40–50 km)";
}
