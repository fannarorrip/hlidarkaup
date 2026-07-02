// Store identity for printed/PDF receipts and invoices.
// Values from the shop's official receipt header (kennitala + VSK nr. are legally
// required on invoices, Rgl. 50/1993). Override via env if these ever change.
export const STORE = {
  name: process.env.STORE_NAME ?? "Hlíðarkaup ehf.",
  address: process.env.STORE_ADDRESS ?? "Akurhlíð 1",
  postal: process.env.STORE_POSTAL ?? "550 Sauðárkrókur",
  phone: process.env.STORE_PHONE ?? "453-6166",
  email: process.env.STORE_EMAIL ?? "hlidarkaup@hlidarkaup.is",
  kennitala: process.env.STORE_KENNITALA ?? "650725-0420",
  vskNr: process.env.STORE_VSK_NR ?? "158053",
  // public/ path to the logo placed top-left on generated invoices.
  logoFile: "logo.png",
  // 505/2013 origin note — now our OWN system, not Regla.
  complianceNote:
    "Reikningur þessi á uppruna sinn í rafrænu bókhaldskerfi Hlíðarkaups skv. reglugerð nr. 505/2013.",
};
