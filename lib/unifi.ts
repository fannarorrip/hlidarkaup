// UniFi Access API helper
// API docs: https://assets.identity.ui.com/unifi-access/api_reference.pdf
// Uses Node's https module directly to bypass self-signed certificate rejection.

import https from "https";
import { URL } from "url";

const UNIFI_HOST = process.env.UNIFI_HOST ?? "";
const UNIFI_TOKEN = process.env.UNIFI_API_TOKEN ?? "";
const UNIFI_CONSOLE_HOST = process.env.UNIFI_CONSOLE_HOST ?? "https://192.168.0.1";
const UNIFI_USERNAME = process.env.UNIFI_USERNAME ?? "";
const UNIFI_PASSWORD = process.env.UNIFI_PASSWORD ?? "";

// ── Session auth for the proxy API (face credentials) ─────────────────────────
let sessionCache: { token: string; csrf: string; expiresAt: number } | null = null;

async function getUnifiSession(): Promise<{ token: string; csrf: string }> {
  if (sessionCache && Date.now() < sessionCache.expiresAt) return sessionCache;

  const body = Buffer.from(JSON.stringify({ username: UNIFI_USERNAME, password: UNIFI_PASSWORD }));
  return new Promise((resolve, reject) => {
    const url = new URL(`${UNIFI_CONSOLE_HOST}/api/auth/login`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port) : 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.byteLength,
          "Origin": UNIFI_CONSOLE_HOST,
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const setCookie = (res.headers["set-cookie"] ?? []).join("; ");
          const token = setCookie.match(/TOKEN=([^;]+)/)?.[1] ?? "";
          const csrf = (res.headers["x-csrf-token"] as string) ?? "";
          if (!token) {
            reject(new Error(`UniFi login failed (${res.statusCode}): ${Buffer.concat(chunks).toString().slice(0, 200)}`));
            return;
          }
          sessionCache = { token, csrf, expiresAt: Date.now() + 90 * 60 * 1000 };
          resolve({ token, csrf });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/** Thrown when UniFi cannot detect a face in the uploaded photo. */
export class FaceNotRecognizedError extends Error {
  constructor() {
    super("Face not recognized in photo");
    this.name = "FaceNotRecognizedError";
  }
}

/** Register a face credential (Touch Pass face unlock) for a UniFi user.
 *  The multipart field name must be "face_image" — discovered via the proxy API. */
export async function addFaceCredential(userId: string, photoBuffer: Buffer, mimeType = "image/jpeg"): Promise<void> {
  const { token, csrf } = await getUnifiSession();
  const boundary = `----FaceBoundary${Date.now()}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="face_image"; filename="face.jpg"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, photoBuffer, footer]);

  return new Promise((resolve, reject) => {
    const url = new URL(`${UNIFI_CONSOLE_HOST}/proxy/users/access/api/v2/users/${userId}/faces`);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port) : 443,
        path: url.pathname,
        method: "POST",
        headers: {
          "Cookie": `TOKEN=${token}`,
          "X-Csrf-Token": csrf,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.byteLength,
          "Origin": UNIFI_CONSOLE_HOST,
        },
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          let json: { code?: number; codeS?: string; msg?: string } = {};
          try {
            json = JSON.parse(Buffer.concat(chunks).toString());
          } catch {
            reject(new Error(`UniFi face upload: invalid response (${res.statusCode})`));
            return;
          }
          if (json.codeS === "SUCCESS" || json.code === 1 || json.code === 0) {
            resolve();
          } else if (json.codeS === "CODE_DEVICE_UPLOAD_PHOTO_FACE_NO_FOUND") {
            reject(new FaceNotRecognizedError());
          } else {
            reject(new Error(`UniFi face upload failed: ${json.msg ?? JSON.stringify(json)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function httpsRequest(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  body?: string | Buffer,
): Promise<{ status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port) : 443,
        path: url.pathname + url.search,
        method,
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          resolve({
            status: res.statusCode ?? 0,
            json: () => Promise.resolve(JSON.parse(raw)),
          });
        });
      },
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function unifiRequest(path: string, method = "GET", body?: object) {
  const bodyStr = body ? JSON.stringify(body) : undefined;
  const res = await httpsRequest(
    method,
    `${UNIFI_HOST}${path}`,
    {
      Authorization: `Bearer ${UNIFI_TOKEN}`,
      "Content-Type": "application/json",
      ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr).toString() } : {}),
    },
    bodyStr,
  );

  if (res.status < 200 || res.status >= 300) {
    const json = await res.json().catch(() => ({})) as { msg?: string };
    throw new Error(`UniFi API ${path} → ${res.status}: ${json?.msg ?? ""}`);
  }

  return res.json();
}

export interface UnifiUser {
  id: string;
  first_name: string;
  last_name: string;
  employee_number?: string;
  user_type: string;
  status: string;
}

/** Look up an existing UniFi user by their kennitala (employee_number). */
async function findUnifiUserByKennitala(kennitala: string): Promise<UnifiUser | null> {
  const body = await unifiRequest(
    `/api/v1/developer/users/search?keyword=${encodeURIComponent(kennitala)}`,
  ) as { data?: UnifiUser[] };
  const match = (body.data ?? []).find((u) => u.employee_number === kennitala);
  return match ?? null;
}

/** Create a local user in UniFi Access, or return the existing one if a user
 *  with the same kennitala already exists (e.g. re-registration).
 *  `created` is true only when a brand-new user was made. */
export async function createUnifiUser(params: {
  firstName: string;
  lastName: string;
  kennitala: string;
  email?: string;
}): Promise<{ user: UnifiUser; created: boolean }> {
  const body = await unifiRequest("/api/v1/developer/users", "POST", {
    first_name: params.firstName,
    last_name: params.lastName,
    employee_number: params.kennitala,
    user_type: "regular",
    ...(params.email ? { email: params.email } : {}),
  }) as { code?: string; data?: UnifiUser };

  if (body.data?.id) return { user: body.data, created: true };

  // Duplicate kennitala — reuse the existing user so face re-registration works.
  if (body.code === "CODE_USER_EMPLOYEE_NUMBER_EXIST") {
    const existing = await findUnifiUserByKennitala(params.kennitala);
    if (existing) return { user: existing, created: false };
  }

  throw new Error(`UniFi user creation failed: ${body.code ?? "unknown error"}`);
}

/** Delete a UniFi user (used to clean up when face registration fails). */
export async function deleteUnifiUser(userId: string): Promise<void> {
  await unifiRequest(`/api/v1/developer/users/${userId}`, "DELETE").catch(() => null);
}

/** Assign a PIN code to a UniFi user.
 *  Retries with a new PIN if the chosen one is already taken (max 10 attempts).
 *  Returns the PIN that was successfully assigned. */
export async function assignPinCode(userId: string, initialPin: string): Promise<string> {
  let pin = initialPin;
  for (let attempt = 0; attempt < 10; attempt++) {
    const res = await httpsRequest(
      "PUT",
      `${UNIFI_HOST}/api/v1/developer/users/${userId}`,
      {
        Authorization: `Bearer ${UNIFI_TOKEN}`,
        "Content-Type": "application/json",
      },
      JSON.stringify({ pin_code: pin }),
    );
    const json = await res.json() as { code?: string; msg?: string };
    if ((json as { code?: string }).code === "SUCCESS" || res.status === 200 && !(json as { code?: string }).code?.includes("INVALID") && !(json as { code?: string }).code?.includes("EXIST")) {
      return pin;
    }
    if ((json as { code?: string }).code?.includes("ALREADY_EXIST")) {
      // Collision — try a different PIN
      pin = String(Math.floor(1000 + Math.random() * 9000));
      continue;
    }
    throw new Error(`UniFi PIN assignment failed: ${(json as { msg?: string }).msg ?? JSON.stringify(json)}`);
  }
  throw new Error("Could not assign unique PIN after 10 attempts");
}

/** Upload a face photo for a UniFi user using multipart form. */
export async function uploadUnifiAvatar(userId: string, photoBuffer: Buffer, mimeType = "image/jpeg"): Promise<void> {
  const boundary = `----FormBoundary${Date.now()}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="selfie.jpg"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, photoBuffer, footer]);

  const url = new URL(`${UNIFI_HOST}/api/v1/developer/users/${userId}/avatar`);
  const res = await httpsRequest(
    "POST",
    url.toString(),
    {
      Authorization: `Bearer ${UNIFI_TOKEN}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.byteLength.toString(),
    },
    body,
  );

  if (res.status < 200 || res.status >= 300) {
    const json = await res.json().catch(() => ({})) as { msg?: string };
    throw new Error(`UniFi avatar upload → ${res.status}: ${json?.msg ?? ""}`);
  }
}

/** Calculate age from Icelandic kennitala (format: DDMMYY-XXXX or DDMMYYXXXX).
 *  9th digit encodes century: 9 = 1900s, 0 = 2000s. */
export function ageFromKennitala(kt: string): number {
  const digits = kt.replace(/\D/g, "");
  if (digits.length < 9) return 0;
  const day = parseInt(digits.substring(0, 2));
  const month = parseInt(digits.substring(2, 4));
  const year2 = parseInt(digits.substring(4, 6));
  const centuryDigit = parseInt(digits[8]);
  const century = centuryDigit === 9 ? 1900 : 2000;
  const year = century + year2;
  const dob = new Date(year, month - 1, day);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}
