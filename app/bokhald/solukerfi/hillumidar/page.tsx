import LabelPrinter from "./LabelPrinter";

export const dynamic = "force-dynamic";

// Hillumiðar á Zebra GK420d: síðan prentast gegnum ZDesigner Windows-driverinn — hver miði
// er ein "síða" í stærð miðans. Bráðabirgðalausn þar til Pricer-rafmiðarnir tengjast.
export default function HillumidarPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Hillumiðar</h1>
      <p className="text-sm text-gray-500 mb-6">
        Veldu vörur (eða sæktu nýbreytt verð), stilltu miðastærðina og prentaðu á Zebra-prentarann (ZDesigner GK420d í prentglugganum).
      </p>
      <LabelPrinter />
    </div>
  );
}
