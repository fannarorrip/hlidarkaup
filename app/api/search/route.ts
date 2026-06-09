import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { mockProducts } from "@/lib/mock-products";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  const { query } = await req.json();

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ ids: [] });
  }

  const productList = mockProducts
    .map((p) => `ID:${p.id} | ${p.name} | ${p.category} | ${p.description}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    system: `You are a grocery store search assistant. Given a search query and a list of products, return the IDs of matching products as a JSON array. Be generous — match by intent, synonyms, Icelandic/English, partial names, and related concepts. For example "morgunkaffi" matches kaffi, "kvöldmatur" matches kjöt/fiskur/pasta, "healthy" matches ávextir/grænmeti/skyr. Return ONLY a JSON array of ID strings, nothing else. Example: ["1","5","12"]`,
    messages: [
      {
        role: "user",
        content: `Query: "${query}"\n\nProducts:\n${productList}\n\nReturn matching product IDs as a JSON array:`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text.trim() : "[]";

  try {
    const ids: string[] = JSON.parse(text);
    return NextResponse.json({ ids });
  } catch {
    return NextResponse.json({ ids: [] });
  }
}
