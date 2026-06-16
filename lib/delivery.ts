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

const IS_WEEKDAYS_SHORT = ["Sun", "Mán", "Þri", "Mið", "Fim", "Fös", "Lau"];

/** Next `count` days starting today (midnight-normalised). */
export function upcomingDays(count: number): Date[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return d;
  });
}

/** Short chip label, e.g. "Mán 17.". */
export function dayChipLabel(d: Date) {
  return `${IS_WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()}.`;
}

/** Time slots for a specific day; future days open fully, today filters past slots. */
export function slotsForDay(date: Date, deliveryType: "pickup" | "delivery") {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const openMin = date.getDay() === 0 ? 600 : 540; // Sunday opens 10:00
  const all = deliveryType === "delivery" ? DELIVERY_TIMES : PICKUP_TIMES;
  return all.map((t) => {
    const [h, m] = t.split(":").map(Number);
    const slot = h * 60 + m;
    return { time: t, past: slot < openMin || (isToday && slot <= nowMin + 30) };
  });
}

export function zoneLabel(km: number): string {
  return km <= 3 ? "Innan Sauðárkróks (0–3 km)"
    : km <= 10 ? "Svæði 1 (3–10 km)"
    : km <= 20 ? "Svæði 2 (10–20 km)"
    : km <= 30 ? "Svæði 3 (20–30 km)"
    : km <= 40 ? "Svæði 4 (30–40 km)"
    : "Svæði 5 (40–50 km)";
}
