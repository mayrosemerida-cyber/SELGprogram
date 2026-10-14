// Learners, access codes, ID photos and report cards.
// Principal and Website Administrator: everyone. Class Adviser: only learners in their own section(s).
import { json, getStaff, hasRole, canManageLearner, newCode, newId, MAX_UPLOAD, clean, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";

const LRN_RE = /^\d{12}$/;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const CARD_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function learnerFields(src, existing = {}) {
  return {
    ...existing,
    lrn: clean(src.lrn),
    lastName: clean(src.lastName),
    firstName: clean(src.firstName),
    middleName: clean(src.middleName),
    sex: clean(src.sex, 10),
    grade: clean(src.grade),
    section: clean(src.section),
    birthdate: clean(src.birthdate),
    guardian: clean(src.guardian),
    guardianContact: clean(src.guardianContact),
    address: clean(src.address),
    schoolYear: clean(src.schoolYear),
  };
}

const sectionError = (me) =>
  json({ error: `You can only manage learners in the section(s) you advise: ${me.sections.map((s) => `${s.grade} – ${s.name}`).join(", ") || "none assigned yet; ask the Principal"}.` }, 403);

export default async (req) => {
  const me = await getStaff(req);
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // learners | import | code | cards | enrollment | officers
  const learners = store("learners");
  const files = store("private");
  const brief = (l) => ({ lrn: l.lrn, name: `${l.lastName}, ${l.firstName}`, grade: l.grade, section: l.section });

  // SELG Adviser: choose which learners are SELG officers (they can then post SELG activities for approval)
  if (action === "officers") {
    if (!hasRole(me, "selg")) return json({ error: "Only the SELG Adviser can manage this." }, 403);
    if (req.method === "GET") return json((await listJSON("learners", "")).filter((l) => l.selgOfficer).map(brief));
    const lrn = req.method === "DELETE" ? url.searchParams.get("lrn") : (await req.json().catch(() => ({}))).lrn;
    const l = lrn && (await learners.get(String(lrn).replace(/\D/g, ""), { type: "json" }));
    if (!l) return json({ error: "No learner with that LRN. Their class adviser needs to add them first." }, 404);
    l.selgOfficer = req.method === "POST";
    await learners.setJSON(l.lrn, l);
    await logActivity(staffLabel(me), l.selgOfficer ? "added SELG officer poster" : "removed SELG officer poster", `${l.firstName} ${l.lastName}`, "SELG");
    return json(brief(l));
  }

  if (!hasRole(me, "adviser", "principal") && !me?.sections.length) return json({ error: "Only class advisers and the Principal can manage learners." }, 403);

  // Transfer to another section, transfer out, drop, or re-enroll
  if (action === "enrollment" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const l = await learners.get(String(b.lrn || ""), { type: "json" });
    if (!l) return json({ error: "Learner not found." }, 404);
    if (!canManageLearner(me, l)) return sectionError(me);
    const today = new Date().toISOString().slice(0, 10);
    let detail;
    if (b.action === "move") {
      if (!clean(b.section)) return json({ error: "Choose the new section." }, 400);
      detail = `moved from ${l.grade} – ${l.section} to ${clean(b.grade)} – ${clean(b.section)}`;
      l.grade = clean(b.grade) || l.grade; l.section = clean(b.section); l.status = "enrolled";
    } else if (b.action === "transfer-out" || b.action === "drop") {
      l.status = b.action === "drop" ? "dropped" : "transferred";
      l.statusDate = clean(b.date) || today;
      l.statusRemarks = clean(b.remarks, 300);
      l.transferredTo = b.action === "transfer-out" ? clean(b.school) : "";
      detail = b.action === "drop" ? "unenrolled (dropped)" : `transferred out${l.transferredTo ? " to " + l.transferredTo : ""}`;
    } else if (b.action === "reenroll") {
      l.status = "enrolled"; l.statusDate = today; l.statusRemarks = ""; l.transferredTo = "";
      detail = "re-enrolled";
    } else return json({ error: "Unknown action." }, 400);
    (l.history ||= []).push({ at: Date.now(), by: me.name, detail });
    await learners.setJSON(l.lrn, l);
    await logActivity(staffLabel(me), "changed enrollment", `${l.firstName} ${l.lastName}: ${detail}`, "Class");
    return json(l);
  }

  if (action === "learners" && req.method === "GET") {
    const all = (await listJSON("learners", "")).filter((l) => canManageLearner(me, l));
    all.sort((a, b) => `${a.grade}${a.section}${a.lastName}${a.firstName}`.localeCompare(`${b.grade}${b.section}${b.lastName}${b.firstName}`));
    return json(all);
  }

  if (action === "learners" && req.method === "POST") {
    const form = await req.formData();
    const lrn = clean(form.get("lrn"));
    if (!LRN_RE.test(lrn)) return json({ error: "LRN must be exactly 12 digits." }, 400);
    const prior = await learners.get(lrn, { type: "json" });
    if (prior && !canManageLearner(me, prior)) return json({ error: "This learner belongs to another section." }, 403);
    const learner = learnerFields(Object.fromEntries(form), prior || { code: newCode(), cards: [], createdAt: Date.now() });
    if (!learner.lastName || !learner.firstName) return json({ error: "First and last name are required." }, 400);
    if (!canManageLearner(me, learner)) return sectionError(me);

    const photo = form.get("photo");
    if (photo instanceof Blob && photo.size > 0) {
      if (!PHOTO_TYPES.includes(photo.type)) return json({ error: "Photo must be JPG, PNG or WEBP." }, 400);
      if (photo.size > MAX_UPLOAD) return json({ error: "Photo is too large." }, 400);
      const key = `photo-${lrn}`;
      await files.set(key, await photo.arrayBuffer(), { metadata: { contentType: photo.type } });
      learner.photoKey = key;
      learner.photoVersion = Date.now();
    }
    await learners.setJSON(lrn, learner);
    await logActivity(staffLabel(me), prior ? "updated learner" : "added learner", `${learner.firstName} ${learner.lastName}`, "Class");
    return json(learner, 201);
  }

  if (action === "import" && req.method === "POST") {
    const rows = await req.json().catch(() => null);
    if (!Array.isArray(rows)) return json({ error: "Expected a list of learners." }, 400);
    const results = { added: 0, updated: 0, skipped: [] };
    for (const row of rows.slice(0, 2000)) {
      const lrn = clean(row.lrn);
      if (!LRN_RE.test(lrn) || !clean(row.lastName) || !clean(row.firstName)) { results.skipped.push(lrn || "(blank LRN)"); continue; }
      const existing = await learners.get(lrn, { type: "json" });
      const next = learnerFields(row, existing || { code: newCode(), cards: [], createdAt: Date.now() });
      if ((existing && !canManageLearner(me, existing)) || !canManageLearner(me, next)) { results.skipped.push(`${lrn} (not your section)`); continue; }
      await learners.setJSON(lrn, next);
      existing ? results.updated++ : results.added++;
    }
    await logActivity(staffLabel(me), "imported learners", `${results.added} new, ${results.updated} updated`, "Class");
    return json(results);
  }

  if (action === "code" && req.method === "POST") {
    const { lrn } = await req.json().catch(() => ({}));
    const learner = lrn && (await learners.get(lrn, { type: "json" }));
    if (!learner) return json({ error: "Learner not found." }, 404);
    if (!canManageLearner(me, learner)) return sectionError(me);
    learner.code = newCode();
    await learners.setJSON(lrn, learner);
    return json({ lrn, code: learner.code });
  }

  if (action === "cards" && req.method === "POST") {
    const form = await req.formData();
    const lrn = clean(form.get("lrn"));
    const learner = await learners.get(lrn, { type: "json" });
    if (!learner) return json({ error: "Add this learner first (LRN not found)." }, 404);
    if (!canManageLearner(me, learner)) return sectionError(me);
    const file = form.get("file");
    if (!(file instanceof Blob) || file.size === 0) return json({ error: "Choose a file." }, 400);
    if (!CARD_TYPES.includes(file.type)) return json({ error: "Report card must be PDF, JPG, PNG or WEBP." }, 400);
    if (file.size > MAX_UPLOAD) return json({ error: "File is too large (max 4.5 MB)." }, 400);
    const id = newId();
    const key = `card-${lrn}-${id}`;
    await files.set(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    learner.cards = learner.cards || [];
    learner.cards.push({ id, key, label: clean(form.get("label")) || "Report Card", contentType: file.type, uploadedAt: Date.now(), by: me.username });
    await learners.setJSON(lrn, learner);
    await logActivity(staffLabel(me), "uploaded report card", `${learner.firstName} ${learner.lastName} · ${clean(form.get("label"))}`, "Class");
    return json(learner, 201);
  }

  if (req.method === "DELETE") {
    const lrn = url.searchParams.get("lrn");
    const learner = lrn && (await learners.get(lrn, { type: "json" }));
    if (!learner) return json({ error: "Learner not found." }, 404);
    if (!canManageLearner(me, learner)) return sectionError(me);
    if (action === "cards") {
      const id = url.searchParams.get("id");
      const card = (learner.cards || []).find((c) => c.id === id);
      if (!card) return json({ error: "Report card not found." }, 404);
      await files.delete(card.key);
      learner.cards = learner.cards.filter((c) => c.id !== id);
      await learners.setJSON(lrn, learner);
      return json(learner);
    }
    await Promise.all((learner.cards || []).map((c) => files.delete(c.key)));
    if (learner.photoKey) await files.delete(learner.photoKey);
    await learners.delete(lrn);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
};

export const config = {
  path: ["/api/admin/learners", "/api/admin/import", "/api/admin/code", "/api/admin/cards", "/api/admin/enrollment", "/api/selg/officers"],
};
