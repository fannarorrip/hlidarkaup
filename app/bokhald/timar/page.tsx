import TimarView from "./TimarView";

export const dynamic = "force-dynamic";

// Tímar starfsmanna (stimpilklukkan á kössunum) + afgreiðslutölfræði.
// Aðgangur: stjórnandi + bókari (middleware) — EKKI lagerstjóri.
export default function TimarPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Tímar starfsmanna</h1>
      <p className="text-sm text-gray-500 mb-6">Stimpilklukkan á kössunum — vinnutímar, leiðréttingar og afgreiðslur hvers starfsmanns.</p>
      <TimarView />
    </div>
  );
}
