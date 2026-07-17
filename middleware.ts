import { NextResponse, type NextRequest } from "next/server";
import { verifyStaffSession, STAFF_COOKIE } from "@/lib/staff-session";
import { isComingSoon } from "@/lib/site-status";

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
  { prefix: "/api/yfirlit", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/screen-ads", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/fylgiskjol", roles: ["stjornandi", "bokari"] },
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
  { prefix: "/api/afskriftir", roles: ["stjornandi", "bokari", "afgreidsla"] },
  { prefix: "/api/kaelar", roles: ["stjornandi", "bokari", "afgreidsla"] },
  { prefix: "/api/reminders", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/dagatal", roles: ["stjornandi", "bokari"] },
  { prefix: "/api/assistant", roles: ["stjornandi", "bokari", "afgreidsla", "eldhus"] },
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
// In-store kiosk surfaces (self-checkout, price checker) — private to the shop, like the back office.
const KIOSK = ["/kassi", "/api/kassi", "/verdskanni"];
// Price checker + the two endpoints it needs (barcode lookup + ad slideshow). VERDSKANNI_PUBLIC=true
// opens ONLY these to the internet for a while; off by default → stays LAN-only like the rest.
const VERDSKANNI = ["/verdskanni", "/api/kassi/scan", "/api/kassi/ads"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // --- Public "coming soon" gate ---------------------------------------------
  // The webshop + public eldhús pages show the splash (app/vinnsla) until we open.
  // Back office (bókhald/kassi/starf/admin + their APIs, staff login) is never gated here —
  // it stays reachable so the owner can prepare. Static assets aren't matched at all.
  const isBackOffice =
    isApi ||
    !!rolesFor(pathname) ||
    KIOSK.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    PUBLIC_STAFF.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isBackOffice && pathname !== "/vinnsla") {
    if (isComingSoon()) {
      const url = req.nextUrl.clone();
      url.pathname = "/vinnsla";
      return NextResponse.rewrite(url); // same URL, splash content
    }
    return NextResponse.next(); // open: public pages pass straight through (no LAN block / auth)
  }
  // ---------------------------------------------------------------------------

  // ADMIN_LAN_ONLY=true (production): the back office is reachable ONLY from the store LAN / VPN.
  // Tunnel traffic always carries Cloudflare's cf-ray header (added at the edge — a public client
  // cannot remove it); direct LAN/VPN requests to :3000 never have it. Everything this middleware
  // matches (bókhald, kassi/starf, admin APIs, staff login) 404s from the internet.
  if (process.env.ADMIN_LAN_ONLY === "true" && req.headers.get("cf-ray") !== null) {
    // Narrow exception: a short allowlist of external IPs may reach the in-store TILL over the
    // tunnel (HTTPS) for remote peripheral testing — printer, skúffa, scanner, scale. Scoped to the
    // kassi tree + the staff-login endpoints it needs; bókhald/admin stay strictly LAN-only.
    // CF-Connecting-IP is stamped by Cloudflare and overwrites any client-supplied value, so it
    // cannot be spoofed for tunnel traffic. Clear KASSI_REMOTE_ALLOW_IPS to shut the door again.
    const allowIps = (process.env.KASSI_REMOTE_ALLOW_IPS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const clientIp = (req.headers.get("cf-connecting-ip") ?? "").trim();
    const tillSurface = [...KIOSK, ...PUBLIC_STAFF].some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    const remoteTillOk = tillSurface && clientIp !== "" && allowIps.includes(clientIp);
    // VERDSKANNI_PUBLIC=true temporarily opens the price checker (and only it) to the internet.
    const verdskanniPublic = process.env.VERDSKANNI_PUBLIC === "true" &&
      VERDSKANNI.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!remoteTillOk && !verdskanniPublic) {
      return isApi
        ? NextResponse.json({ error: "Not found" }, { status: 404 })
        : new NextResponse("Not found", { status: 404 });
    }
    // allowlisted IP → fall through to the normal kiosk / staff-session flow below.
  }

  if (PUBLIC_STAFF.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();

  // In-store kiosk surfaces (self-checkout page + its APIs): no staff session on the LAN, but
  // caught by the tunnel block above — the internet gets 404. Staff-gated kassi paths
  // (/kassi/starf, /api/kassi/sale) have RULES entries and continue to the session check.
  if (KIOSK.some((p) => pathname === p || pathname.startsWith(p + "/")) && !rolesFor(pathname)) {
    return NextResponse.next();
  }

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
    // public pages behind the "coming soon" gate
    "/",
    "/vefverslun", "/vefverslun/:path*",
    "/cart", "/cart/:path*",
    "/checkout", "/checkout/:path*",
    "/confirmation", "/confirmation/:path*",
    "/eldhus", "/eldhus/:path*",
    "/sjalfsali", "/sjalfsali/:path*",
    // back office
    "/starf", "/starf/:path*",
    "/api/auth/staff/:path*",
    "/bokhald/:path*",
    "/kassi", "/kassi/:path*",
    "/api/kassi/:path*",
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
    "/api/yfirlit",
    "/api/screen-ads", "/api/screen-ads/:path*",
    "/api/fylgiskjol/:path*",
    "/verdskanni",
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
  ],
};
