// Password rules and two-step sign-in (authenticator app codes, RFC 6238 TOTP)
import crypto from "node:crypto";
import { store } from "./store.mjs";
import { hashPassword, checkPassword } from "./auth.mjs";

/* ---------------- Password rules ---------------- */
const COMMON = ["password", "123456", "12345678", "qwerty", "abc123", "letmein", "welcome", "admin", "teacher", "deped", "romblon", "school", "iloveyou", "monkey", "dragon", "sunshine"];
export const PASSWORD_HINT = "At least 10 characters, with both letters and numbers. Avoid your name, username or common words like \"password\".";

// Returns an error message, or "" if the password is acceptable
export function passwordProblem(pw, { username = "", name = "" } = {}) {
  const p = String(pw || "");
  if (p.length < 10) return "Password must be at least 10 characters.";
  if (p.length > 128) return "Password is too long.";
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return "Password must include both letters and numbers.";
  if (/^(.)\1+$/.test(p)) return "Password can't be the same character repeated.";
  const low = p.toLowerCase();
  if (username && username.length >= 3 && low.includes(username.toLowerCase())) return "Password can't contain your username.";
  for (const part of String(name).toLowerCase().split(/[\s.,]+/)) {
    if (part.length >= 4 && low.includes(part)) return "Password can't contain your name.";
  }
  if (COMMON.some((w) => low.includes(w))) return "Password is too easy to guess. Avoid common words like \"password\", \"deped\" or \"school\".";
  return "";
}

/* ---------------- Base32 ---------------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/* ---------------- TOTP ---------------- */
function totp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
  return code;
}
// Accept the current code or one 30-second step either side (phone clocks drift)
export function verifyTotp(secret, code, lastCounter = -1) {
  const c = String(code || "").replace(/\D/g, "");
  if (c.length !== 6) return -1;
  const now = Math.floor(Date.now() / 30000);
  for (const step of [0, -1, 1]) {
    const counter = now + step;
    if (counter <= lastCounter) continue; // a code can't be used twice
    const expected = totp(secret, counter);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(c))) return counter;
  }
  return -1;
}
export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));
export const totpForTest = (secret) => totp(secret, Math.floor(Date.now() / 30000));

/* ---------------- Per-account two-step record ---------------- */
// store "security", key "2fa-<username>": { enabled, secret, pendingSecret, lastCounter, recovery: [hashes], enabledAt }
const key = (u) => `2fa-${u}`;
export const get2fa = async (u) => (await store("security").get(key(u), { type: "json" })) || { enabled: false };
export const save2fa = (u, rec) => store("security").setJSON(key(u), rec);
export const delete2fa = (u) => store("security").delete(key(u));

// Emergency switch: in Netlify, set DISABLE_2FA_FOR=admin (comma-separated usernames) and redeploy
export const twoStepBypassed = (u) => String(process.env.DISABLE_2FA_FOR || "").split(",").map((s) => s.trim().toLowerCase()).includes(u);

export function newRecoveryCodes() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const codes = Array.from({ length: 8 }, () => {
    const b = crypto.randomBytes(8);
    const s = Array.from(b, (x) => chars[x % chars.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
  return { codes, hashes: codes.map((c) => hashPassword(c)) };
}
// Returns the remaining hashes if the recovery code matched, else null
export function useRecoveryCode(rec, code) {
  const c = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 8) return null;
  const formatted = `${c.slice(0, 4)}-${c.slice(4)}`;
  const i = (rec.recovery || []).findIndex((h) => checkPassword(formatted, h));
  if (i < 0) return null;
  return rec.recovery.filter((_, j) => j !== i);
}
