"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function ConfirmationContent() {
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? "—";
  const pickupTime = params.get("pickupTime") ?? "—";
  const deliveryType = params.get("deliveryType") ?? "pickup";
  const isDelivery = deliveryType === "delivery";

  return (
    <div className="max-w-lg mx-auto text-center py-16">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-4xl">✅</span>
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Pöntun móttekin!</h1>
      <p className="text-gray-500 mb-8">Takk fyrir. Við hlökkum til að sjá þig.</p>

      <div className="bg-white border border-gray-200 rounded-xl p-6 text-left space-y-4 mb-8">
        <div className="flex justify-between">
          <span className="text-gray-500">Pöntunarnúmer</span>
          <span className="font-semibold">{orderId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{isDelivery ? "Afhendingartími" : "Sóttnartími"}</span>
          <span className="font-semibold text-brand-red">{pickupTime}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Tegund</span>
          <span className="font-semibold">{isDelivery ? "🚚 Heimsending" : "🏪 Sæki í verslun"}</span>
        </div>
        {!isDelivery && (
          <div className="flex justify-between items-center">
            <span className="text-gray-500">Staðsetning</span>
            <Logo height={28} />
          </div>
        )}
      </div>

      <p className="text-sm text-gray-500 mb-6">
        {isDelivery
          ? "Við munum hafa samband ef eitthvað kemur upp."
          : "Sæktu vörurnar á Akurhlíð 1, Sauðárkrókur. Koma þarf með pöntunarnúmerið."}
      </p>

      <Link
        href="/vefverslun"
        className="inline-block bg-brand-red hover:bg-brand-red-dark text-white font-bold px-8 py-3 rounded-xl transition-colors"
      >
        Panta aftur
      </Link>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense>
      <ConfirmationContent />
    </Suspense>
  );
}
