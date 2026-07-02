// Client-safe role definitions (no server imports).
export type Role = "stjornandi" | "bokari" | "afgreidsla" | "eldhus";

export const ROLES: Role[] = ["stjornandi", "bokari", "afgreidsla", "eldhus"];

export const ROLE_LABEL: Record<Role, string> = {
  stjornandi: "Stjórnandi",
  bokari: "Bókari",
  afgreidsla: "Afgreiðsla",
  eldhus: "Eldhús",
};

export interface StaffRow {
  email: string; name: string | null; role: Role; is_active: boolean;
}
