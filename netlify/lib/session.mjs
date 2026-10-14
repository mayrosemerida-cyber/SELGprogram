import crypto from "node:crypto";

const SECRET = process.env.SESSION_SECRET || "";

function sign(value) {
  return crypto.createHmac("sha256", SECRET).update(value).digest("base64url");
}

// Pack an object into a tamper-proof cookie value
export function seal(obj, maxAgeSeconds) {
  const payload = Buffer.from(
    JSON.stringify({ ...obj, exp: Date.now() + maxAgeSeconds * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Read it back; returns null if missing, forged or expired
export function unseal(value) {
  if (!value || !SECRET) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  return data.exp > Date.now() ? data : null;
}

export function getCookie(req, name) {
  const header = req.headers.get("cookie") || "";
  const match = header.split(/;\s*/).find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

export function cookie(name, value, maxAgeSeconds) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
