// School Calendar: the school's own activities, plus edits to the DepEd dates built into calendar.js
// (an item with "deped" = that DepEd date's id changes or hides it).
// Everyone can read. The Principal and the Website Administrator add, edit and delete.
import { json, getStaff, hasRole, newId, clean, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["classes", "exam", "assess", "holiday", "break", "event", "school"];
const DEPED_ID = /^d-\d{4}-\d{2}-\d{2}-[a-z0-9-]{1,40}$/;

export default async (req) => {
  const cal = store("calendar");
  if (req.method === "GET") {
    const all = (await listJSON("calendar", "")).sort((a, b) => a.start.localeCompare(b.start));
    return json(all.map(({ id, start, end, title, note, type, deped, hidden }) => ({ id, start, end, title, note, type, deped, hidden })));
  }
  const me = await getStaff(req);
  if (!hasRole(me, "admin", "principal")) return json({ error: "Only the Principal or the Website Administrator can edit the school calendar." }, 403);

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const start = clean(b.start), end = clean(b.end), title = clean(b.title, 160), note = clean(b.note, 400);
    const deped = clean(b.deped, 80), type = TYPES.includes(b.type) ? b.type : "school";
    if (deped && !DEPED_ID.test(deped)) return json({ error: "Unknown DepEd date." }, 400);
    if (deped && b.hidden) {
      const id = `ovr-${deped}`;
      await cal.setJSON(id, { id, deped, hidden: true, start: "", end: "", title: clean(b.title, 160), by: me.username, updatedAt: Date.now() });
      await logActivity(staffLabel(me), "hid DepEd calendar date", clean(b.title, 160), "Calendar");
      return json({ ok: true });
    }
    if (!DATE.test(start) || !title) return json({ error: "Enter the date and the activity." }, 400);
    if (end && (!DATE.test(end) || end < start)) return json({ error: "The end date must be on or after the start date." }, 400);
    const id = deped ? `ovr-${deped}` : (b.id && String(b.id).startsWith("cal-") ? b.id : `cal-${newId()}`);
    const rec = { id, start, end: end && end !== start ? end : "", title, note, type, ...(deped ? { deped } : {}), by: me.username, updatedAt: Date.now() };
    await cal.setJSON(id, rec);
    await logActivity(staffLabel(me), deped ? "edited DepEd calendar date" : b.id ? "updated school calendar activity" : "added school calendar activity", `${title} (${start})`, "Calendar");
    return json(rec, b.id ? 200 : 201);
  }
  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id") || "";
    const rec = await cal.get(id, { type: "json" });
    if (!rec) return json({ error: "Not found" }, 404);
    await cal.delete(id);
    await logActivity(staffLabel(me), rec.deped ? "restored DepEd calendar date" : "deleted school calendar activity", rec.title, "Calendar");
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/calendar" };
