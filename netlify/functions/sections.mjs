// Sections by grade level and their advisers.
// Public: list. Admin: create/edit/delete. Adviser: upload/download their School Form 1 (SF1).
import { json, getStaff, hasRole, allSections, sameSection, newId, clean, saveFiles, DOC_TYPES, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON, getFile } from "../lib/store.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // sections | sf1 | claim
  const sections = store("sections");

  if (action === "sections" && req.method === "GET") {
    const [list, staff, learners] = await Promise.all([allSections(), listJSON("staff", ""), listJSON("learners", "")]);
    const names = Object.fromEntries(staff.map((s) => [s.username, s.name]));
    const me = url.searchParams.get("mine") ? await getStaff(req) : null;
    return json(list.map((s) => ({
      id: s.id, grade: s.grade, name: s.name, room: s.room || "", schoolYear: s.schoolYear || "",
      adviser: s.adviser || "", adviserName: names[s.adviser] || (s.adviser === "admin" ? "Website Administrator" : ""),
      learners: learners.filter((l) => (l.status || "enrolled") === "enrolled" && l.section?.toLowerCase() === s.name.toLowerCase()).length,
      ...(me && (hasRole(me, "admin", "principal") || s.adviser === me.username) ? { sf1: s.sf1 || null } : {}),
    })));
  }

  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);

  // School Form 1 file for a section (the adviser's official class list)
  if (action === "sf1") {
    const sec = await sections.get(url.searchParams.get("id") || "", { type: "json" });
    if (!sec) return json({ error: "Section not found." }, 404);
    if (!hasRole(me, "admin", "principal") && sec.adviser !== me.username) return json({ error: "You are not the adviser of this section." }, 403);
    if (req.method === "GET") {
      const f = sec.sf1 && (await getFile("private", sec.sf1.key));
      if (!f) return new Response("Not found", { status: 404 });
      return new Response(f.data, { headers: { "Content-Type": f.contentType, "Content-Disposition": `attachment; filename="${sec.sf1.name.replace(/"/g, "")}"`, "Cache-Control": "private, no-store" } });
    }
    if (req.method === "POST") {
      const form = await req.formData();
      let saved;
      try { saved = await saveFiles([form.get("file")], `sf1-${sec.id}`, { storeName: "private", types: [...DOC_TYPES, "text/csv"], label: "School Form 1" }); }
      catch (e) { return json({ error: e.message }, 400); }
      if (!saved.length) return json({ error: "Choose the SF1 file." }, 400);
      if (sec.sf1) await store("private").delete(sec.sf1.key);
      sec.sf1 = { ...saved[0], uploadedAt: Date.now(), by: me.username };
      await sections.setJSON(sec.id, sec);
      await logActivity(staffLabel(me), "uploaded School Form 1", `${sec.grade} – ${sec.name}`, "Class");
      return json(sec);
    }
  }

  // A teacher sets up their own class from their School Form 1:
  // creates the section (or takes an existing one that has no adviser yet) with them as adviser.
  if (action === "claim" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const grade = clean(b.grade), name = clean(b.name).replace(/^section\s*/i, "");
    if (!grade || !name) return json({ error: "Enter the grade level and section name." }, 400);
    const list = await allSections();
    let sec = list.find((s) => sameSection(s, grade, name) && s.grade);
    if (sec && sec.adviser && sec.adviser !== me.username) {
      const other = sec.adviser === "admin" ? null : await store("staff").get(sec.adviser, { type: "json" });
      return json({ error: `${sec.grade} – ${sec.name} already has an adviser${other?.name ? ` (${other.name})` : ""}. Please ask the Principal to assign it to you under Sections.` }, 409);
    }
    const isNew = !sec;
    sec = { ...(sec || { id: `sec-${newId()}`, grade, name, room: "" }), adviser: me.username, schoolYear: clean(b.schoolYear) || sec?.schoolYear || "" };
    await sections.setJSON(sec.id, sec);
    await logActivity(staffLabel(me), isNew ? "added their class from School Form 1" : "took advisory of section from School Form 1", `${sec.grade} – ${sec.name}`, "Sections");
    return json(sec);
  }

  if (!hasRole(me, "admin", "principal")) return json({ error: "Only the Principal and the Website Administrator can edit sections." }, 403);

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const grade = clean(b.grade), name = clean(b.name);
    if (!grade || !name) return json({ error: "Enter the grade level and section name." }, 400);
    const id = b.id || `sec-${newId()}`;
    const prev = (await sections.get(id, { type: "json" })) || {};
    const rec = { ...prev, id, grade, name, adviser: clean(b.adviser), room: clean(b.room), schoolYear: clean(b.schoolYear) };
    await sections.setJSON(id, rec);
    await logActivity(staffLabel(me), b.id ? "updated section" : "added section", `${grade} – ${name}`, "Sections");
    return json(rec);
  }
  if (req.method === "DELETE") {
    const sec = await sections.get(url.searchParams.get("id") || "", { type: "json" });
    if (!sec) return json({ error: "Not found" }, 404);
    if (sec.sf1) await store("private").delete(sec.sf1.key);
    await sections.delete(sec.id);
    await logActivity(staffLabel(me), "deleted section", `${sec.grade} – ${sec.name}`, "Sections");
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/sections", "/api/sections/sf1", "/api/sections/claim"] };
