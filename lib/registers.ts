// The store's register fleet: 2 self-checkout kiosks + 3 staffed tills = 5 payment points.
// Each physical device opens its OWN link (e.g. /kassi?reg=sjalfsafgreidsla1) so it knows which
// register it is — which drives which card terminal (posi) it charges and how sales are tagged.
//
// Terminal-per-register: set ADYEN_POIID_<ID> (and optionally ADYEN_SALEID_<ID>) in the env when
// the real posar arrive, e.g. ADYEN_POIID_KASSI1=... . Until then every register falls back to the
// single configured terminal (ADYEN_POS_POIID) so the current test keeps working.

export type RegisterType = "sjalfsafgreidsla" | "kassi";
export interface Register { id: string; name: string; type: RegisterType }

export const REGISTERS: Register[] = [
  { id: "sjalfsafgreidsla1", name: "Sjálfsafgreiðsla 1", type: "sjalfsafgreidsla" },
  { id: "sjalfsafgreidsla2", name: "Sjálfsafgreiðsla 2", type: "sjalfsafgreidsla" },
  { id: "kassi1", name: "Kassi 1", type: "kassi" },
  { id: "kassi2", name: "Kassi 2", type: "kassi" },
  { id: "kassi3", name: "Kassi 3", type: "kassi" },
];

/** Resolve a `reg` link param to a register. Unknown/empty falls back to the first of the
 *  requested type (or the first register overall) so a mis-set device still works. */
export function resolveRegister(reg?: string | null, type?: RegisterType): Register {
  const found = reg ? REGISTERS.find((r) => r.id === reg) : undefined;
  if (found) return found;
  return (type ? REGISTERS.find((r) => r.type === type) : undefined) ?? REGISTERS[0];
}

/** The register id to STORE on a sale — a known id, else null (don't invent an attribution). */
export function knownRegisterId(reg?: string | null): string | null {
  return reg && REGISTERS.some((r) => r.id === reg) ? reg : null;
}

/** Display name for a stored register id (e.g. "kassi1" → "Kassi 1"); null if unknown/empty. */
export function registerName(id?: string | null): string | null {
  return REGISTERS.find((r) => r.id === id)?.name ?? null;
}

/** The card terminal (posi) for a register — per-register env override, else the single
 *  configured terminal. SaleID defaults to the register id so each register is distinct in Adyen.
 *  Server-only (reads env); the client imports only REGISTERS / resolveRegister. */
export function registerTerminal(regId: string): { poiid: string; saleId: string } {
  const KEY = regId.toUpperCase();
  return {
    poiid: process.env[`ADYEN_POIID_${KEY}`] || process.env.ADYEN_POS_POIID || "",
    saleId: process.env[`ADYEN_SALEID_${KEY}`] || regId,
  };
}
