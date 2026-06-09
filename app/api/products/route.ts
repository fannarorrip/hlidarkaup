import { NextRequest, NextResponse } from "next/server";

const REGLA_BASE = process.env.REGLA_BASE_URL ?? "https://www.regla.is/fibs/RestAPI2019";
const REGLA_USER = process.env.REGLA_USERNAME ?? "";
const REGLA_PASS = process.env.REGLA_PASSWORD ?? "";

// ── Token cache (reuse for 20 min) ────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  const res = await fetch(`${REGLA_BASE}/Login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: REGLA_USER, password: REGLA_PASS }),
  });
  const data = await res.json();
  if (!data?.Result?.Success) throw new Error("Regla login failed");
  const token = data.Result.Messages?.[0];
  if (!token || token.startsWith("INFO_")) throw new Error("No token");
  cachedToken = token;
  tokenExpiry = Date.now() + 20 * 60 * 1000; // 20 min
  return token;
}

// ── Map Regla product → our Product type ──────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(p: any) {
  const netPrice = p.UnitPrice ?? 0;
  const vatPct = p.VatDefinition?.Percentage ?? 24;
  const grossPrice = Math.round(netPrice * (1 + vatPct / 100));
  return {
    id: String(p.ProductNumber ?? p.ID ?? ""),
    name: p.Name ?? "",
    description: p.DescriptionShort || p.DescriptionLong || p.Name || "",
    price: grossPrice,
    category: p.ProductGroupNumber ?? p.ProductGroup?.Name ?? "",
    stock: p.IsInStockControl ? Math.floor(p.StockQuantity ?? 0) : undefined,
    image: p.ImageUrl ?? undefined,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search   = searchParams.get("search") ?? "";
  const page     = parseInt(searchParams.get("page") ?? "0", 10);
  const limit    = parseInt(searchParams.get("limit") ?? "48", 10);
  const indexFrom = page * limit;

  // Fall back to mock data if no Regla credentials
  if (!REGLA_USER || !REGLA_PASS) {
    return NextResponse.json({ products: [], total: 0, page, limit });
  }

  try {
    const token = await getToken();

    const res = await fetch(`${REGLA_BASE}/SearchProducts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        search,
        indexFrom,
        maxRecordCount: limit,
      }),
    });

    const data = await res.json();

    if (!data?.Result?.Success) {
      console.error("Regla SearchProducts error:", data?.Result?.Messages);
      return NextResponse.json({ products: [], total: 0, page, limit });
    }

    // Parse total count from messages
    const countMsg = data.Result.Messages?.find((m: string) => m.includes("INFO_SEARCH_TOTAL_COUNT"));
    const total = countMsg ? parseInt(countMsg.split(";")[1], 10) : 0;

    const products = (data.Returned ?? []).map(mapProduct).filter((p: { price: number }) => p.price > 0);

    return NextResponse.json({ products, total, page, limit });
  } catch (err) {
    console.error("Regla products error:", err);
    return NextResponse.json({ error: "Could not fetch products" }, { status: 500 });
  }
}
