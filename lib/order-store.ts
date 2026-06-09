/**
 * Order storage abstraction.
 * – Local dev: reads/writes orders.json on disk.
 * – Netlify (production): uses Netlify Blobs (serverless-safe).
 */

const IS_NETLIFY = !!process.env.NETLIFY;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StoredOrder {
  id: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  pickupTime: string;
  deliveryType: "pickup" | "delivery";
  deliveryAddress: string | null;
  shippingCost: number;
  total: number;
  items: { id: string; name: string; price: number; quantity: number }[];
  status: string;
  reglaError?: boolean;
}

// ── Netlify Blobs helpers ─────────────────────────────────────────────────────
async function blobsGetAll(): Promise<StoredOrder[]> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore("orders");
  const { blobs } = await store.list();
  const orders = await Promise.all(blobs.map((b) => store.get(b.key, { type: "json" })));
  return (orders.filter(Boolean) as StoredOrder[]);
}

async function blobsSave(order: StoredOrder): Promise<void> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore("orders");
  await store.setJSON(order.id, order);
}

async function blobsUpdate(id: string, status: string): Promise<StoredOrder | null> {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore("orders");
  const order = await store.get(id, { type: "json" }) as StoredOrder | null;
  if (!order) return null;
  order.status = status;
  await store.setJSON(id, order);
  return order;
}

// ── Local fs helpers ──────────────────────────────────────────────────────────
const path = IS_NETLIFY ? null : require("path");
const fs   = IS_NETLIFY ? null : require("fs");
const ORDERS_FILE = IS_NETLIFY ? "" : path.join(process.cwd(), "orders.json");

function fsGetAll(): StoredOrder[] {
  try {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch { return []; }
}

function fsSave(order: StoredOrder): void {
  const orders = fsGetAll();
  orders.push(order);
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
}

function fsUpdate(id: string, status: string): StoredOrder | null {
  const orders = fsGetAll();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  orders[idx].status = status;
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), "utf-8");
  return orders[idx];
}

// ── Public API ────────────────────────────────────────────────────────────────
export async function getAllOrders(): Promise<StoredOrder[]> {
  return IS_NETLIFY ? blobsGetAll() : fsGetAll();
}

export async function saveOrder(order: StoredOrder): Promise<void> {
  if (IS_NETLIFY) { await blobsSave(order); } else { fsSave(order); }
}

export async function updateOrderStatus(id: string, status: string): Promise<StoredOrder | null> {
  return IS_NETLIFY ? blobsUpdate(id, status) : fsUpdate(id, status);
}
