// Principal and Website Administrator: see recent activity across all pages and portals
import { json, getStaff, hasRole } from "../lib/auth.mjs";
import { store } from "../lib/store.mjs";

export default async (req) => {
  const me = await getStaff(req);
  if (!hasRole(me, "admin", "principal")) return json({ error: "Only the Principal and the Website Administrator can see the activity log." }, 403);
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);
  const s = store("activity");
  const { blobs } = await s.list({ prefix: "" });
  const keys = blobs.map((b) => b.key).sort().reverse().slice(0, limit);
  const items = (await Promise.all(keys.map((k) => s.get(k, { type: "json" })))).filter(Boolean);
  return json(items);
};

export const config = { path: "/api/admin/activity" };
