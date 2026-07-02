import { NextResponse, type NextRequest } from "next/server";
import { verifyStaffSession, STAFF_COOKIE } from "@/lib/staff-session";

// Role-based access for the unified admin. Most-specific prefix first.
const RULES: { prefix: string; roles: string[] }[] = [
  { prefix: "/bokhald/starfsmenn", roles: ["stjornandi"] },
  { prefix: "/bokhald/bankatenging", roles: ["stjornandi"] },
  { prefix: "/api/staff", roles: ["stjornandi"] },
  { prefix: "/api/bankatenging", roles: ["stjornandi"] },
  { prefix: "/bokhald", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/products", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/purchases", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/skraning", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/laun", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/suppliers", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/innkaup", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/inexchange/poll", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/einvoice", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/reikningur", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/profjofnudur", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/rekstur", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/efnahagur", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/arsreikningur", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/vsk", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/hreyfingar", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/manaduppgjor", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/manadarreikningur", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/birgdaskyrsla", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/afstemming", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/kassauppgjor", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/pantanir", roles: ["stjornandi", "bokari"] },
  { prefix: "/kassi/starf", roles: ["stjornandi", "afgreidsla"] },
  { prefix: "/api/kassi/sale", roles: ["stjornandi", "afgreidsla"] },
  { prefix: "/api/customers", roles: ["stjornandi", "bokari", "afgreidsla"] },
  { prefix: "/eldhus/admin", roles: ["stjornandi", "eldhus"] },
  { prefix: "/api/eldhus/admin", roles: ["stjornandi", "eldhus"] },
  { prefix: "/admin", roles: ["stjornandi", "afgreidsla", "eldhus"] },
  { prefix: "/starf", roles: ["stjornandi", "bokari", "afgreidsla", "eldhus"] },
];
function rolesFor(pathname: string): string[] | null {
  for (const r of RULES) if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.roles;
  return null;
}

// Staff-auth endpoints + login page need no session (they ARE the way in) — but they still fall
// under the LAN-only block below, so the login screen isn't even visible from the internet.
const PUBLIC_STAFF = ["/starf/login", "/api/auth/staff/login", "/api/auth/staff/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // ADMIN_LAN_ONLY=true (production): the back office is reachable ONLY from the store LAN / VPN.
  // Tunnel traffic always carries Cloudflare's cf-ray header (added at the edge — a public client
  // cannot remove it); direct LAN/VPN requests to :3000 never have it. Everything this middleware
  // matches (bókhald, kassi/starf, admin APIs, staff login) 404s from the internet.
  if (process.env.ADMIN_LAN_ONLY === "true" && req.headers.get("cf-ray") !== null) {
    return isApi
      ? NextResponse.json({ error: "Not found" }, { status: 404 })
      : new NextResponse("Not found", { status: 404 });
  }

  if (PUBLIC_STAFF.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  const token = req.cookies.get(STAFF_COOKIE)?.value;
  const session = token ? await verifyStaffSession(token) : null;

  if (!session) {
    if (isApi) return NextResponse.json({ error: "Innskráning starfsmanns krafist" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/starf/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const allowed = rolesFor(pathname);
  if (allowed && !allowed.includes(session.role)) {
    if (isApi) return NextResponse.json({ error: "Ekki næg réttindi" }, { status: 403 });
    const url = req.nextUrl.clone();
    url.pathname = "/starf"; // staff home shows what this role can access
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/starf", "/starf/:path*",
    "/api/auth/staff/:path*",
    "/bokhald/:path*",
    "/kassi/starf", "/kassi/starf/:path*",
    "/admin/:path*",
    "/eldhus/admin", "/eldhus/admin/:path*",
    "/api/eldhus/admin", "/api/eldhus/admin/:path*",
    "/api/staff", "/api/staff/:path*",
    "/api/products/:path+",
    "/api/customers", "/api/customers/:path*",
    "/api/purchases",
    "/api/skraning/:path*",
    "/api/laun/:path*",
    "/api/suppliers", "/api/suppliers/:path*",
    "/api/innkaup/:path*",
    "/api/inexchange/poll",
    "/api/einvoice/:path*",
    "/api/reikningur/:path*",
    "/api/profjofnudur/:path*",
    "/api/rekstur/:path*",
    "/api/efnahagur/:path*",
    "/api/arsreikningur/:path*",
    "/api/vsk/:path*",
    "/api/hreyfingar/:path*",
    "/api/manaduppgjor",
    "/api/manadarreikningur/:path*",
    "/api/birgdaskyrsla/:path*",
    "/api/afstemming/:path*",
    "/api/kassauppgjor/:path*",
    "/api/pantanir/:path*",
    "/api/bankatenging/:path*",
    "/api/kassi/sale",
  ],
};
