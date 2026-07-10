// Hjálpari — a small in-app assistant (Claude) for quick questions from the bókhald UI.
// Given live reminder context so it can answer "hvað þarf ég að muna í dag?" concretely.
import Anthropic from "@anthropic-ai/sdk";
import { getReminders } from "@/lib/reminders";
import { STORE } from "@/lib/store";

export function assistantEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

export interface ChatTurn { role: "user" | "assistant"; content: string }

const SYSTEM_BASE =
  `Þú ert hjálpari í bókhalds- og verslunarkerfi ${STORE.name} (íslensk matvöruverslun á Sauðárkróki). ` +
  `Svaraðu STUTT og hjálplega á íslensku (nema notandinn skrifi á öðru tungumáli). ` +
  `Þú getur svarað spurningum um reksturinn, skiladaga skatta (VSK, staðgreiðsla, tryggingagjald, lífeyrir, ársreikningur, skattframtal), ` +
  `pantanir, kæla/HACCP, kröfur og almennar bókhaldsspurningar. ` +
  `Ef spurt er um áminningar eða „hvað þarf ég að gera" notaðu áminningalistann hér að neðan. ` +
  `Þú framkvæmir EKKI aðgerðir (bókar ekki, sendir ekki) — þú leiðbeinir og bendir á réttan stað í kerfinu. ` +
  `Ef þú veist ekki svarið, segðu það hreinskilnislega. Ekki finna upp tölur eða skiladaga.`;

async function reminderContext(): Promise<string> {
  try {
    const items = await getReminders(14);
    if (!items.length) return "Áminningalisti: ekkert áríðandi núna.";
    const lines = items.slice(0, 20).map((r) => {
      const when = r.dueDate ? (r.daysUntil === 0 ? "í dag" : r.daysUntil != null && r.daysUntil < 0 ? `${-r.daysUntil} d. yfir` : `eftir ${r.daysUntil} d.`) : "";
      return `- [${r.severity}] ${r.title}${when ? ` (${when})` : ""}${r.detail ? ` — ${r.detail}` : ""}`;
    });
    return "Áminningalisti (áríðandi efst):\n" + lines.join("\n");
  } catch {
    return "Áminningalisti: ekki tókst að sækja.";
  }
}

export async function chat(messages: ChatTurn[]): Promise<{ ok: boolean; reply?: string; error?: string }> {
  if (!assistantEnabled()) return { ok: false, error: "ANTHROPIC_API_KEY vantar." };
  const clean = (messages || [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  if (!clean.length || clean[clean.length - 1].role !== "user") return { ok: false, error: "Engin spurning." };

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = process.env.ASSISTANT_MODEL || "claude-opus-4-8";
    const msg = await client.messages.create({
      model,
      max_tokens: 1024,
      system: `${SYSTEM_BASE}\n\n${await reminderContext()}`,
      messages: clean as Anthropic.MessageParam[],
    });
    const block = msg.content.find((c) => c.type === "text") as { text: string } | undefined;
    return { ok: true, reply: (block?.text || "").trim() || "(ekkert svar)" };
  } catch (e) {
    console.error("assistant chat failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "Villa" };
  }
}
