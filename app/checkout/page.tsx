"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Script from "next/script";
import { useCart } from "@/lib/cart-context";
import { TruckIcon, BuildingStorefrontIcon } from "@heroicons/react/24/outline";

// ── Time slots ────────────────────────────────────────────────────────────────
// Pickup: 09:00–21:30, Delivery: 09:00–18:30
// Sunday opens at 10:00
function generateTimes(lastHour: number, lastMin: number): string[] {
  const times: string[] = [];
  for (let h = 9; h <= lastHour; h++) {
    for (const m of [0, 30]) {
      if (h === lastHour && m > lastMin) break;
      times.push(`${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`);
    }
  }
  return times;
}
const PICKUP_TIMES   = generateTimes(21, 30);
const DELIVERY_TIMES = generateTimes(18, 30);

const IS_MONTHS = ["janúar","febrúar","mars","apríl","maí","júní","júlí","ágúst","september","október","nóvember","desember"];
const IS_WEEKDAYS = ["Sunnudagur","Mánudagur","Þriðjudagur","Miðvikudagur","Fimmtudagur","Föstudagur","Laugardagur"];
function formatTodayIcelandic(d: Date) {
  return `${IS_WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${IS_MONTHS[d.getMonth()]}`;
}

// ── Shipping ──────────────────────────────────────────────────────────────────
// Akurhlíð 1, Sauðárkrókur
const STORE = { lat: 65.7460, lng: -19.6290 };

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function calcShipping(km: number): number | null {
  if (km <= 3)  return 500;    // Innan Sauðárkróks
  if (km <= 10) return 1500;   // 3–10 km
  if (km <= 20) return 3000;   // 10–20 km
  if (km <= 30) return 4500;   // 20–30 km
  if (km <= 40) return 6000;   // 30–40 km
  if (km <= 50) return 7500;   // 40–50 km
  return null;                  // Yfir 50 km — ekki í boði
}

// ── Component ─────────────────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { google: any; initAutocomplete?: () => void; }
}

export default function CheckoutPage() {
  const { items, total, clear } = useCart();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickupTime, setPickupTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup");
  const [address, setAddress] = useState("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const addressInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const autocompleteRef = useRef<any>(null);

  const shippingCost = deliveryType === "delivery" && distanceKm !== null ? calcShipping(distanceKm) : 0;
  const deliveryUnavailable = deliveryType === "delivery" && distanceKm !== null && calcShipping(distanceKm) === null;
  const grandTotal = total + (shippingCost ?? 0);

  // Time slots
  const { todayLabel, availableTimes, firstAvailable } = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const isSunday = now.getDay() === 0;
    const openMin = isSunday ? 10 * 60 : 9 * 60;
    const allTimes = deliveryType === "delivery" ? DELIVERY_TIMES : PICKUP_TIMES;
    const availableTimes = allTimes.map((t) => {
      const [h, m] = t.split(":").map(Number);
      const slotMin = h * 60 + m;
      return { time: t, past: slotMin <= nowMin + 30 || slotMin < openMin };
    });
    return {
      todayLabel: formatTodayIcelandic(now),
      availableTimes,
      firstAvailable: availableTimes.find(t => !t.past)?.time ?? null,
    };
  }, [deliveryType]);

  // Init autocomplete when Maps is ready AND delivery section is visible
  useEffect(() => {
    if (!mapsReady || deliveryType !== "delivery") return;
    // Wait a tick for the input to mount
    const timer = setTimeout(() => {
      if (!addressInputRef.current) return;
      if (autocompleteRef.current) return; // already set up
      autocompleteRef.current = new window.google.maps.places.Autocomplete(
        addressInputRef.current,
        { types: ["address"], componentRestrictions: { country: "is" } }
      );
      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current!.getPlace();
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const km = haversineKm(lat, lng, STORE.lat, STORE.lng);
        setAddress(place.formatted_address ?? addressInputRef.current?.value ?? "");
        setDistanceKm(Math.round(km * 10) / 10);
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [mapsReady, deliveryType]);

  if (items.length === 0) {
    return (
      <div className="text-center py-24">
        <p className="text-xl text-gray-600 mb-4">Karfan er tóm</p>
        <Link href="/" className="text-brand-red hover:underline font-medium">← Til baka í vörur</Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pickupTime) { setError("Veldu hvenær þú vilt " + (deliveryType === "pickup" ? "sækja" : "fá vörurnar")); return; }
    if (deliveryType === "delivery" && !address.trim()) { setError("Settu inn heimilisfang"); return; }
    if (deliveryType === "delivery" && distanceKm === null) { setError("Vinsamlegast veldu heimilisfang úr listanum"); return; }
    if (deliveryUnavailable) { setError("Heimsending er ekki í boði á þetta svæði."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items, customerName: name, customerPhone: phone,
          deliveryType, pickupTime,
          deliveryAddress: deliveryType === "delivery" ? address : undefined,
          shippingCost,
          total: grandTotal,
        }),
      });
      const data = await res.json();
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else if (data.orderId) {
        clear();
        router.push(`/confirmation?orderId=${data.orderId}&pickupTime=${pickupTime}&deliveryType=${deliveryType}`);
      } else {
        setError(data.error || "Eitthvað fór úrskeiðis. Reyndu aftur.");
      }
    } catch {
      setError("Eitthvað fór úrskeiðis. Reyndu aftur.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Load Google Maps Places */}
      <Script
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        onLoad={() => setMapsReady(true)}
      />

      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Greiðsla</h1>
        <form onSubmit={handleSubmit} className="space-y-6">

          {/* Delivery type toggle */}
          <div className="bg-white border border-gray-200 rounded-xl p-2 flex gap-2">
            <button type="button" onClick={() => { setDeliveryType("pickup"); autocompleteRef.current = null; }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all ${
                deliveryType === "pickup" ? "bg-brand-red text-white shadow" : "text-gray-500 hover:text-gray-800"
              }`}>
              <BuildingStorefrontIcon className="w-5 h-5" />
              Sækja í verslun
            </button>
            <button type="button" onClick={() => setDeliveryType("delivery")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-semibold text-sm transition-all ${
                deliveryType === "delivery" ? "bg-brand-red text-white shadow" : "text-gray-500 hover:text-gray-800"
              }`}>
              <TruckIcon className="w-5 h-5" />
              Heimsending
            </button>
          </div>

          {/* Customer info */}
          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <h2 className="font-semibold text-lg text-gray-800">Upplýsingar</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nafn *</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
                placeholder="Jón Jónsson" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Símanúmer *</label>
              <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
                placeholder="555-1234" />
            </div>
          </div>

          {/* Delivery address */}
          {deliveryType === "delivery" && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-lg text-gray-800">Heimilisfang</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Heimilisfang *</label>
                <input
                  ref={addressInputRef}
                  type="text"
                  value={address}
                  onChange={(e) => { setAddress(e.target.value); setDistanceKm(null); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-red"
                  placeholder="Skagabraut 1, Sauðárkrókur"
                />
                <p className="text-xs text-gray-400 mt-1">Veldu heimilisfang úr lista til að reikna sendingarkostnað</p>
              </div>

              {distanceKm !== null && (
                deliveryUnavailable ? (
                  <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 space-y-1">
                    <p className="text-sm text-gray-600">
                      Fjarlægð frá Akurhlíð 1: <strong>{distanceKm} km</strong>
                    </p>
                    <p className="text-base font-bold text-gray-700">
                      😔 Því miður bjóðum við ekki upp á heimsendingu svo langt frá Sauðárkróki.
                    </p>
                  </div>
                ) : (
                  <div className="bg-red-50 border border-red-100 rounded-lg p-4 space-y-1">
                    <p className="text-sm text-gray-600">
                      Fjarlægð frá Akurhlíð 1: <strong>{distanceKm} km</strong>
                    </p>
                    <p className="text-sm text-gray-500">
                      {distanceKm <= 3  ? "Innan Sauðárkróks (0–3 km)"
                      : distanceKm <= 10 ? "Svæði 1 (3–10 km)"
                      : distanceKm <= 20 ? "Svæði 2 (10–20 km)"
                      : distanceKm <= 30 ? "Svæði 3 (20–30 km)"
                      : distanceKm <= 40 ? "Svæði 4 (30–40 km)"
                      : "Svæði 5 (40–50 km)"}
                    </p>
                    <p className="text-base font-bold text-brand-red">
                      Sendingarkostnaður: {(shippingCost ?? 0).toLocaleString("is-IS")} kr.
                    </p>
                  </div>
                )
              )}

              {distanceKm === null && (
                <div className="text-xs text-gray-400 space-y-0.5">
                  <p>📍 0–3 km (Sauðárkrókur): 500 kr.</p>
                  <p>🚗 3–10 km: 1.500 kr.</p>
                  <p>🚗 10–20 km: 3.000 kr.</p>
                  <p>🛣️ 20–30 km: 4.500 kr.</p>
                  <p>🛣️ 30–40 km: 6.000 kr.</p>
                  <p>🛣️ 40–50 km: 7.500 kr.</p>
                  <p>❌ Yfir 50 km: Ekki í boði</p>
                </div>
              )}
            </div>
          )}

          {/* Time slot */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
              <h2 className="font-semibold text-lg text-gray-800">
                {deliveryType === "pickup" ? "Hvenær viltu sækja?" : "Hvenær á að afhenda?"}
              </h2>
              <span className="text-sm font-medium text-brand-red bg-red-50 px-3 py-1 rounded-full">
                {todayLabel}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {deliveryType === "delivery"
                ? <>Heimsending til <strong>18:30</strong></>
                : <>Sækja til <strong>21:30</strong> &mdash; opið 09:00–22:00 (Sun 10:00)</>}
              {firstAvailable ? ` — fyrsti laus tími er ${firstAvailable}` : ""}
            </p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {availableTimes.map(({ time, past }) => (
                <button key={time} type="button" disabled={past} onClick={() => setPickupTime(time)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    past ? "border-gray-200 text-gray-300 bg-gray-50 cursor-not-allowed line-through"
                    : pickupTime === time ? "bg-brand-red text-white border-brand-red"
                    : "border-gray-300 hover:border-brand-red hover:text-brand-red"
                  }`}>
                  {time}
                </button>
              ))}
            </div>
            {pickupTime && (
              <p className="mt-3 text-sm text-brand-red font-medium">
                ✓ Valinn tími: {pickupTime} — {todayLabel}
              </p>
            )}
          </div>

          {/* Order summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h2 className="font-semibold text-lg text-gray-800 mb-3">Yfirlit pöntunar</h2>
            <div className="space-y-2 mb-4">
              {items.map(({ product, quantity }) => (
                <div key={product.id} className="flex justify-between text-sm text-gray-700">
                  <span>{product.name} × {quantity}</span>
                  <span>{(product.price * quantity).toLocaleString("is-IS")} kr.</span>
                </div>
              ))}
              {deliveryType === "delivery" && distanceKm !== null && (
                <div className="flex justify-between text-sm text-gray-700">
                  <span>Sendingarkostnaður</span>
                  <span>{(shippingCost ?? 0).toLocaleString("is-IS")} kr.</span>
                </div>
              )}
            </div>
            <div className="border-t pt-3 flex justify-between font-bold text-lg">
              <span>Samtals</span>
              <span className="text-brand-red">{grandTotal.toLocaleString("is-IS")} kr.</span>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-brand-red hover:bg-brand-red-dark disabled:opacity-60 text-white font-bold py-4 rounded-xl transition-colors text-lg">
            {loading ? "Hleð..." : "Greiða með korti →"}
          </button>
        </form>
      </div>
    </>
  );
}
