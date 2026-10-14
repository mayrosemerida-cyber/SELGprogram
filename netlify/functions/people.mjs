// People shown on public pages, with photos:
//   org       – Organizational chart (level 1 = top)          → Principal / Website Administrator
//   committee – School committees (grouped by committee name) → Principal / Website Administrator
//   selg      – SELG officers and advisers for the school year → SELG Adviser
import { json, getStaff, hasRole, newId, clean, savePhotos, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";

const GROUPS = ["org", "committee", "selg"];
const canEdit = (me, group) => hasRole(me, "admin", "principal") || (group === "selg" && hasRole(me, "selg"));

export default async (req) => {
  const url = new URL(req.url);
  const people = store("people");

  if (req.method === "GET") {
    const group = url.searchParams.get("group");
    if (!GROUPS.includes(group)) return json({ error: "Unknown group" }, 400);
    const items = (await listJSON("people", group + "-")).sort((a, b) =>
      (a.level || 0) - (b.level || 0) || (a.committee || "").localeCompare(b.committee || "") || (a.order || 0) - (b.order || 0) || a.createdAt - b.createdAt);
    return json(items);
  }

  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);

  if (req.method === "POST") {
    const form = await req.formData();
    const group = form.get("group");
    if (!GROUPS.includes(group)) return json({ error: "Unknown group" }, 400);
    if (!canEdit(me, group)) return json({ error: "You can't edit this list." }, 403);
    const name = clean(form.get("name"), 120), position = clean(form.get("position"), 120);
    if (!name || !position) return json({ error: "Enter the name and position." }, 400);
    const id = clean(form.get("id")) || `${group}-${newId()}`;
    const prev = (await people.get(id, { type: "json" })) || { createdAt: Date.now() };
    const rec = {
      ...prev, id, group, name, position,
      level: Number(form.get("level")) || 1,
      committee: clean(form.get("committee"), 120),
      order: Number(form.get("order")) || 0,
      schoolYear: clean(form.get("schoolYear"), 30),
    };
    try {
      const [photo] = await savePhotos([form.get("photo")].filter(Boolean), id);
      if (photo) { if (prev.photoKey) await store("media").delete(prev.photoKey); rec.photoKey = photo; }
    } catch (e) { return json({ error: e.message }, 400); }
    await people.setJSON(id, rec);
    const area = { org: "Organizational Chart", committee: "Committees", selg: "SELG" }[group];
    await logActivity(staffLabel(me), prev.id ? "updated" : "added", `${position}: ${name}`, area);
    return json(rec, prev.id ? 200 : 201);
  }

  if (req.method === "DELETE") {
    const rec = await people.get(url.searchParams.get("id") || "", { type: "json" });
    if (!rec) return json({ error: "Not found" }, 404);
    if (!canEdit(me, rec.group)) return json({ error: "You can't edit this list." }, 403);
    if (rec.photoKey) await store("media").delete(rec.photoKey);
    await people.delete(rec.id);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/people" };
