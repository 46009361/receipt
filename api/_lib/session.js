/* Encrypted session cookie. AES-256-GCM via node:crypto — no dependencies.
   Encrypted, not merely signed: a signed cookie is still readable by anyone
   holding it, and this payload carries an HCA access token. */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

import { isDev } from "./config.js";

const COOKIE = "rcpt_session";
const TTL_MS = 1000 * 60 * 60 * 12;

function key() {
  const raw = process.env.SESSION_KEY;
  if (!raw) throw new Error("SESSION_KEY is not set");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("SESSION_KEY must be 32 bytes, base64-encoded");
  return buf;
}

export function seal(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify({ ...payload, exp: Date.now() + TTL_MS }), "utf8"),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function unseal(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const [iv, tag, body] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
    const payload = JSON.parse(json);
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null; // bad tag, tampered, or wrong key — all equally "no session"
  }
}

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) {
      try { return decodeURIComponent(v.join("=")); } catch { return null; }
    }
  }
  return null;
}

export function getSession(req) {
  const session = unseal(readCookie(req, COOKIE));
  // Pre-CSRF cookies require a fresh sign-in.
  return session?.csrf ? session : null;
}

export function setCookie(res, name, value, maxAgeSec) {
  // Safari drops Secure cookies on http://localhost, which would make the whole
  // flow untestable in dev. Tied to the configured origin, so any https
  // deployment — including a preview — still gets it.
  const secure = !isDev();

  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  const existing = res.getHeader("Set-Cookie");
  const list = existing ? (Array.isArray(existing) ? existing : [existing]) : [];
  res.setHeader("Set-Cookie", [...list, attrs.join("; ")]);
}

export function setSession(res, payload) {
  setCookie(res, COOKIE, seal({
    ...payload,
    csrf: payload.csrf || randomBytes(32).toString("base64url"),
  }), TTL_MS / 1000);
}

export function clearSession(res) {
  setCookie(res, COOKIE, "", 0);
}

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export { COOKIE };
