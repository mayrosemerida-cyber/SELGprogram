// Turn phone / computer notifications on or off for the signed-in staff member.
import { json, getStaff, logActivity, staffLabel } from "../lib/auth.mjs";
import { vapidKeys, saveSubscription, removeSubscription, devicesOf, notifyUsers } from "../lib/push.mjs";

export default async (req) => {
  const action = new URL(req.url).pathname.split("/").pop(); // key | subscribe | unsubscribe | test | devices
  if (action === "key") return json({ publicKey: (await vapidKeys()).publicKey });
  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);
  if (action === "devices") return json(await devicesOf(me.username));
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const b = await req.json().catch(() => ({}));
  if (action === "subscribe") {
    try { await saveSubscription(me.username, b.subscription, b.device); } catch (e) { return json({ error: e.message }, 400); }
    await logActivity(staffLabel(me), "turned on notifications", String(b.device || "").slice(0, 80), "Security");
    return json({ ok: true });
  }
  if (action === "unsubscribe") {
    if (b.endpoint) await removeSubscription(me.username, String(b.endpoint));
    return json({ ok: true });
  }
  if (action === "test") {
    const sent = await notifyUsers([me.username], { title: "✅ Notifications are working", body: "You'll get alerts here from the Romblon East Central School website.", url: "/admin.html" });
    return json({ sent });
  }
  return json({ error: "Not found" }, 404);
};

export const config = { path: ["/api/push/key", "/api/push/subscribe", "/api/push/unsubscribe", "/api/push/test", "/api/push/devices"] };
