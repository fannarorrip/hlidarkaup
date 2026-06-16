"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { C } from "../theme";
import type { Meal } from "../meals";
import { useBox } from "../box-context";
import { supabase } from "@/lib/supabase/client";
import { STORE, formatTodayIcelandic, haversineKm, calcShipping, zoneLabel, upcomingDays, dayChipLabel, slotsForDay } from "@/lib/delivery";

const serif = { fontFamily: "var(--font-eldhus-serif)" } as const;

export default function CheckoutView({ meals }: { meals: Meal[] }) {
  const box = useBox();
  const selectedMeals = box.selected
    .map((slug) => meals.find((m) => m.slug === slug))
    .filter((m): m is Meal => Boolean(m));

  const [deliveryType, setDeliveryType] = useState<"pickup" | "delivery">("pickup");
  const [plan, setPlan] = useState<"once" | "subscription">("once");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const days = useMemo(() => upcomingDays(14), []);
  const [dayIdx, setDayIdx] = useState(0);
  const selectedDay = days[dayIdx];
  const [time, setTime] = useState("");
  const [address, setAddress] = useState("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [placed, setPlaced] = useState<{ ref: string } | null>(null);

  const addressRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acRef = useRef<any>(null);

  const shipping = deliveryType === "delivery" && distanceKm !== null ? calcShipping(distanceKm) : 0;
  const outOfArea = deliveryType === "delivery" && distanceKm !== null && calcShipping(distanceKm) === null;
  const grandTotal = box.total + (shipping ?? 0);

  const availableTimes = useMemo(() => slotsForDay(selectedDay, deliveryType), [selectedDay, deliveryType]);
  const dayLabel = formatTodayIcelandic(selectedDay);

  // Reset the chosen time whenever the day or delivery type changes.
  useEffect(() => { setTime(""); }, [dayIdx, deliveryType]);

  useEffect(() => {
    if (!mapsReady || deliveryType !== "delivery") return;
    const timer = setTimeout(() => {
      if (!addressRef.current || acRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const g = (window as any).google;
      acRef.current = new g.maps.places.Autocomplete(addressRef.current, { types: ["address"], componentRestrictions: { country: "is" } });
      acRef.current.addListener("place_changed", () => {
        const place = acRef.current.getPlace();
        if (!place.geometry?.location) return;
        const km = haversineKm(place.geometry.location.lat(), place.geometry.location.lng(), STORE.lat, STORE.lng);
        setAddress(place.formatted_address ?? addressRef.current?.value ?? "");
        setDistanceKm(Math.round(km * 10) / 10);
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [mapsReady, deliveryType]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!box.isFull) { setError("Karfan er ekki tilbúin."); return; }
    if (!name.trim() || !phone.trim()) { setError("Fylltu út nafn og símanúmer."); return; }
    if (!time) { setError("Veldu tíma."); return; }
    if (deliveryType === "delivery") {
      if (!address.trim() || distanceKm === null) { setError("Veldu heimilisfang úr listanum."); return; }
      if (outOfArea) { setError("Heimsending er ekki í boði á þetta svæði."); return; }
    }
    setError("");
    setSaving(true);

    const ref = String(Date.now()).slice(-6);
    // MOCK payment (Straumur next). Order is persisted to Supabase for the kitchen.
    const order = {
      ref,
      plan,
      delivery_type: deliveryType,
      pickup_time: time,
      delivery_date: selectedDay.toISOString().slice(0, 10),
      address: deliveryType === "delivery" ? address : null,
      distance_km: distanceKm,
      shipping: shipping ?? 0,
      portions: box.portions,
      meals: box.target,
      items: selectedMeals.map((m) => ({ slug: m.slug, title: m.title })),
      subtotal: box.total,
      total: grandTotal,
      customer_name: name,
      customer_phone: phone,
      customer_email: email.trim() || null,
      status: "new",
    };

    if (supabase) {
      const { error: err } = await supabase.from("orders").insert(order);
      if (err) { setError("Tókst ekki að skrá pöntun. Reyndu aftur."); setSaving(false); return; }
    }

    // Send a confirmation email if one was provided (don't block the order on it).
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      fetch("/api/eldhus/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(), ref, plan, deliveryType,
          address: deliveryType === "delivery" ? address : null,
          time, date: dayLabel, items: selectedMeals.map((m) => ({ title: m.title })), total: grandTotal,
        }),
      }).catch(() => { /* email is best-effort */ });
    }

    setSaving(false);
    setPlaced({ ref });
    box.clear();
  }

  // ── Confirmation ──────────────────────────────────────────────
  if (placed) {
    return (
      <main className="max-w-xl mx-auto px-6 py-20 text-center">
        <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6" style={{ backgroundColor: C.red }}>
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-4xl font-bold mb-3" style={{ ...serif, color: C.deep }}>Takk fyrir pöntunina!</h1>
        <p className="mb-2" style={{ color: C.ink }}>
          {plan === "subscription" ? "Áskriftin þín er virk." : "Pöntunin þín er staðfest."} Pöntunarnúmer <strong>#{placed.ref}</strong>.
        </p>
        <p className="mb-8" style={{ color: C.muted }}>
          {deliveryType === "delivery" ? "Heimsending" : "Sókn í Hlíðarkaup"} · {dayLabel} · {time}
        </p>
        <Link href="/eldhus" className="inline-block font-bold px-8 py-4 rounded-full text-white" style={{ backgroundColor: C.red }}>
          Til baka á forsíðu
        </Link>
      </main>
    );
  }

  // ── Guard: box not full ───────────────────────────────────────
  if (!box.isFull) {
    return (
      <main className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="text-3xl font-bold mb-3" style={{ ...serif, color: C.deep }}>Karfan er ekki tilbúin</h1>
        <p className="mb-8" style={{ color: C.muted }}>Veldu réttina þína áður en þú gengur frá pöntun.</p>
        <Link href="/eldhus/matsedill" className="inline-block font-bold px-8 py-4 rounded-full text-white" style={{ backgroundColor: C.red }}>
          Á matseðilinn
        </Link>
      </main>
    );
  }

  return (
    <>
      <Script src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`} onLoad={() => setMapsReady(true)} />
      <main className="max-w-2xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold mb-6" style={{ ...serif, color: C.deep }}>Ganga frá pöntun</h1>
        <form onSubmit={submit} className="space-y-5">

          {/* Plan */}
          <Card title="Tegund pöntunar">
            <div className="flex gap-3">
              <Toggle on={plan === "once"} onClick={() => setPlan("once")} label="Stök pöntun" />
              <Toggle on={plan === "subscription"} onClick={() => setPlan("subscription")} label="Vikuleg áskrift" />
            </div>
            {plan === "subscription" && (
              <p className="text-sm mt-3" style={{ color: C.muted }}>Þú getur sleppt viku eða hætt hvenær sem er.</p>
            )}
          </Card>

          {/* Pickup / delivery */}
          <Card title="Afhending">
            <div className="flex gap-3 mb-1">
              <Toggle on={deliveryType === "pickup"} onClick={() => { setDeliveryType("pickup"); acRef.current = null; }} label="🏬 Sækja í verslun" />
              <Toggle on={deliveryType === "delivery"} onClick={() => setDeliveryType("delivery")} label="🚚 Heimsending" />
            </div>
          </Card>

          {/* Address */}
          {deliveryType === "delivery" && (
            <Card title="Heimilisfang">
              <input ref={addressRef} value={address} onChange={(e) => { setAddress(e.target.value); setDistanceKm(null); }}
                placeholder="Skagabraut 1, Sauðárkrókur" className={inp} />
              <p className="text-xs mt-1" style={{ color: C.muted }}>Veldu heimilisfang úr lista til að reikna sendingarkostnað.</p>
              {distanceKm !== null && (
                <p className="text-sm mt-3" style={{ color: outOfArea ? C.red : C.deep }}>
                  {outOfArea
                    ? `😔 Því miður náum við ekki svona langt (${distanceKm} km).`
                    : `${zoneLabel(distanceKm)} · Sendingarkostnaður ${(shipping ?? 0).toLocaleString("is-IS")} kr.`}
                </p>
              )}
            </Card>
          )}

          {/* Contact */}
          <Card title="Upplýsingar">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nafn" className={`${inp} mb-3`} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Símanúmer" type="tel" className={`${inp} mb-3`} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Netfang (fyrir staðfestingu)" type="email" inputMode="email" className={inp} />
          </Card>

          {/* Day + time */}
          <Card title={deliveryType === "pickup" ? "Hvenær viltu sækja?" : "Hvenær á að afhenda?"}>
            {/* Day picker */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
              {days.map((d, i) => {
                const on = i === dayIdx;
                return (
                  <button key={i} type="button" onClick={() => setDayIdx(i)}
                    className="shrink-0 px-3 py-2 rounded-xl text-sm font-semibold border transition-colors text-center"
                    style={on ? { backgroundColor: C.deep, color: "#fff", borderColor: C.deep } : { borderColor: C.tealSoft, color: C.deep }}>
                    {dayChipLabel(d)}
                  </button>
                );
              })}
            </div>
            <p className="text-sm mb-3" style={{ color: C.muted }}>{dayLabel}</p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {availableTimes.every((s) => s.past) && (
                <p className="col-span-full text-sm" style={{ color: C.muted }}>Enginn laus tími þennan dag — veldu annan dag.</p>
              )}
              {availableTimes.map(({ time: t, past }) => (
                <button key={t} type="button" disabled={past} onClick={() => setTime(t)}
                  className="py-2 rounded-lg text-sm font-medium border transition-colors disabled:line-through disabled:opacity-40"
                  style={time === t ? { backgroundColor: C.red, color: "#fff", borderColor: C.red } : { borderColor: C.tealSoft, color: C.deep }}>
                  {t}
                </button>
              ))}
            </div>
          </Card>

          {/* Summary */}
          <Card title="Yfirlit">
            <div className="space-y-1.5 mb-3">
              {selectedMeals.map((m) => (
                <div key={m.slug} className="flex justify-between text-sm">
                  <span style={{ color: C.ink }}>{m.title}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 space-y-1 text-sm" style={{ borderColor: C.tealSoft }}>
              <div className="flex justify-between" style={{ color: C.muted }}>
                <span>{box.target} {box.target === 1 ? "réttur" : "réttir"} × {box.portions} manna</span>
                <span>{box.total.toLocaleString("is-IS")} kr.</span>
              </div>
              {deliveryType === "delivery" && distanceKm !== null && !outOfArea && (
                <div className="flex justify-between" style={{ color: C.muted }}>
                  <span>Sending</span><span>{(shipping ?? 0).toLocaleString("is-IS")} kr.</span>
                </div>
              )}
              <div className="flex justify-between items-end pt-2">
                <span className="font-bold" style={{ color: C.ink }}>Samtals{plan === "subscription" ? " á viku" : ""}</span>
                <span className="text-2xl font-extrabold" style={{ color: C.red }}>{grandTotal.toLocaleString("is-IS")} kr.</span>
              </div>
            </div>
          </Card>

          {error && <p className="text-sm font-semibold" style={{ color: C.red }}>{error}</p>}

          <button type="submit" disabled={saving} className="w-full font-bold py-4 rounded-full text-white transition-transform active:scale-95 disabled:opacity-50" style={{ backgroundColor: C.red }}>
            {saving ? "Skrái pöntun…" : plan === "subscription" ? "Hefja áskrift" : "Greiða með korti"}
          </button>
          <p className="text-[11px] text-center" style={{ color: C.muted }}>Kortagreiðsla (Straumur) tengist í næsta skrefi.</p>
        </form>
      </main>
    </>
  );
}

const inp = "w-full rounded-xl px-3 py-2.5 outline-none text-sm border border-gray-200";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-3xl p-6 shadow-sm">
      <h2 className="text-lg font-bold mb-4" style={{ ...serif, color: C.deep }}>{title}</h2>
      {children}
    </section>
  );
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="flex-1 py-3 rounded-xl text-sm font-bold transition-colors"
      style={on ? { backgroundColor: C.red, color: "#fff" } : { backgroundColor: C.cream, color: C.deep, border: `1px solid ${C.tealSoft}` }}>
      {label}
    </button>
  );
}
