// Phone / computer notifications (Web Push). Free: no email or SMS service needed.
// Each staff member turns them on per device under My account. The keys are made automatically
// the first time and kept in the "security" store (or set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY in Netlify).
import webpush from "web-push";
import crypto from "node:crypto";
import { store, listJSON } from "./store.mjs";

let keys = null;
export async function vapidKeys() {
  if (keys) return keys;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    keys = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const sec = store("security");
    keys = await sec.get("vapid", { type: "json" });
    if (!keys) { keys = webpush.generateVAPIDKeys(); await sec.setJSON("vapid", keys); }
  }
  webpush.setVapidDetails("mailto:111386@deped.gov.ph", keys.publicKey, keys.privateKey);
  return keys;
}

const subId = (username, endpoint) => `${username}--${crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 24)}`;

export async function saveSubscription(username, sub, device = "") {
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("Invalid subscription.");
  const id = subId(username, sub.endpoint);
  await store("push").setJSON(id, { id, username, sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, device: String(device).slice(0, 120), createdAt: Date.now() });
  return id;
}
export async function removeSubscription(username, endpoint) {
  await store("push").delete(subId(username, endpoint));
}
export async function devicesOf(username) {
  return (await listJSON("push", username + "--")).map(({ id, device, createdAt }) => ({ id, device, createdAt }));
}

// Send to these usernames. Never throws: a failed notification must not break the action that caused it.
export async function notifyUsers(usernames, { title, body = "", url = "/admin.html", tag } = {}) {
  try {
    const want = new Set(usernames.filter(Boolean));
    if (!want.size) return 0;
    await vapidKeys();
    const subs = (await listJSON("push", "")).filter((s) => want.has(s.username));
    const payload = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification(s.sub, payload, { TTL: 60 * 60 * 24 }); sent++; }
      catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await store("push").delete(s.id); }
    }));
    return sent;
  } catch (e) { console.error("push failed", e); return 0; }
}

// Usernames of active staff with any of these roles (the built-in "admin" counts as Website Administrator)
export async function usersWithRole(...roles) {
  const staff = await listJSON("staff", "");
  const out = staff.filter((s) => s.status === "active" && (s.roles || []).some((r) => roles.includes(r))).map((s) => s.username);
  if (roles.includes("admin")) out.push("admin");
  return out;
}
