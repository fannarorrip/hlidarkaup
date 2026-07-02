import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { mockProducts } from "@/lib/mock-products";

export const runtime = "nodejs";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// This endpoint is public (storefront search) and calls Anthropic per request, so it needs guards
// against unbounded cost / abuse. Single self-hosted Node process → in-memory limiter + cache are
// sufficient (no shared store needed).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;          // per IP per minute
const CACHE_TTL_MS = 5 * 60_000;    // identical queries served from cache for 5 min
const MAX_QUERY_LEN = 100;

const hits = new Map<string, { count: number; resetAt: number }>();
const cache = new Map<string, { ids: string[]; expiresAt: number }>();

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.resetAt) { hits.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false; }
  e.count++;
  return e.count > MAX_PER_WINDOW;
}

// Opportunistic cleanup so the maps can't grow unbounded from many distinct IPs/queries.
function prune() {
  const now = Date.now();
  if (hits.size > 1000) for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
  if (cache.size > 1000) for (const [k, v] of cache) if (now > v.expiresAt) cache.delete(k);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const query = typeof body.query === "string" ? body.query.trim().slice(0, MAX_QUERY_LEN) : "";

  if (query.length < 2) return NextResponse.json({ ids: [] });

  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ ids: [], error: "rate_limited" }, { status: 429 });
  }

  const key = query.toLowerCase();
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return NextResponse.json({ ids: cached.ids });

  prune();

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

  const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";

  try {
    const ids: string[] = JSON.parse(text);
    cache.set(key, { ids, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ ids });
  } catch {
    return NextResponse.json({ ids: [] });
  }
}
