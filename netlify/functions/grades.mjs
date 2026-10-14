// SF9 / Learner's Performance Report (Terms 1–3).
// Advisers upload their SF9 workbook (grades per term + attendance); learners see only their own
// report card, and only the terms the adviser has released.
import {
  json, getStaff, getLearner, canManageLearner, canManageSection, allSections, sameSection, sectionOfLearner,
  clean, logActivity, staffLabel,
} from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";
import { getSettings } from "../lib/settings.mjs";

export const TERMS = ["t1", "t2", "t3"];
export const MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr"];
// Keys used in the stored grades (match the SF9 workbook's columns)
export const AREAS = ["Filipino", "English", "Mathematics", "Science", "AP", "GMRC/VE", "EPP/TLE", "MAPEH", "MA", "PEH", "GA"];

const num = (v) => {
  const s = String(v ?? "").trim();
  if (s === "") return "";
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : "";
};

async function schoolInfo() {
  const st = await getSettings();
  return {
    name: st.schoolName, schoolId: st.schoolId, region: st.sf9Region, division: st.division,
    district: st.sf9District, town: st.sf9Town, headName: st.headName, logoKey: st.logoKey,
  };
}

// What a learner may see: only released terms; comments only for released terms
function forLearner(card, released) {
  if (!card) return null;
  const out = { ...card, terms: {}, comments: {} };
  for (const t of TERMS) {
    if (released?.[t]) { out.terms[t] = card.terms?.[t] || {}; out.comments[t] = card.comments?.[t] || ""; }
  }
  if (!TERMS.every((t) => released?.[t])) { delete out.admittedTo; delete out.eligibleFor; }
  return out;
}

const profile = (l) => ({
  lrn: l.lrn, lastName: l.lastName, firstName: l.firstName, middleName: l.middleName, sex: l.sex,
  birthdate: l.birthdate, grade: l.grade, section: l.section, status: l.status || "enrolled",
});

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // grades | import | comment | release
  const cards = store("grades");
  const sections = store("sections");

  if (req.method === "GET") {
    const me = await getStaff(req);

    // Adviser: summary of the whole section
    if (me && url.searchParams.get("section")) {
      const sec = (await allSections()).find((s) => s.id === url.searchParams.get("section"));
      if (!canManageSection(me, sec)) return json({ error: "Not your section." }, 403);
      const ls = (await listJSON("learners", "")).filter((l) => sameSection(sec, l.grade, l.section));
      const recs = await Promise.all(ls.map((l) => cards.get(l.lrn, { type: "json" })));
      return json({
        meta: sec.sf9 || {},
        learners: ls.map((l, i) => ({ ...profile(l), card: recs[i] || null })),
      });
    }

    // One learner's report card (adviser preview, or the learner themself)
    let l, released, preview = false;
    if (me) {
      const lrn = url.searchParams.get("lrn");
      l = lrn && (await store("learners").get(lrn, { type: "json" }));
      if (!l || !canManageLearner(me, l)) return json({ error: "Not your learner." }, 403);
      preview = true;
    } else {
      l = await getLearner(req);
      if (!l) return json({ error: "Please sign in." }, 401);
    }
    const sec = await sectionOfLearner(l);
    const meta = sec?.sf9 || {};
    released = meta.released || {};
    const card = await cards.get(l.lrn, { type: "json" });
    return json({
      learner: profile(l),
      section: sec ? { grade: sec.grade, name: sec.name } : { grade: l.grade, name: l.section },
      meta: { schoolYear: meta.schoolYear || "", adviserName: meta.adviserName || "", schoolHead: meta.schoolHead || "", classDays: meta.classDays || {}, released },
      card: preview ? card : forLearner(card, released),
      school: await schoolInfo(),
      preview,
    });
  }

  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);
  const b = await req.json().catch(() => ({}));

  // Upload from the SF9 workbook: grades for any terms present, plus attendance
  if (action === "import") {
    const sec = (await allSections()).find((s) => s.id === b.sectionId);
    if (!canManageSection(me, sec)) return json({ error: "You are not the adviser of this section." }, 403);
    const m = b.meta || {};
    sec.sf9 = {
      ...(sec.sf9 || {}),
      schoolYear: clean(m.schoolYear) || sec.sf9?.schoolYear || sec.schoolYear || "",
      adviserName: clean(m.adviserName) || sec.sf9?.adviserName || "",
      schoolHead: clean(m.schoolHead) || sec.sf9?.schoolHead || "",
      classDays: Object.fromEntries(MONTHS.map((mo) => [mo, num(m.classDays?.[mo]) === "" ? (sec.sf9?.classDays?.[mo] ?? "") : num(m.classDays[mo])])),
      released: sec.sf9?.released || { t1: false, t2: false, t3: false },
      updatedAt: Date.now(),
    };
    await sections.setJSON(sec.id, sec);

    const learners = store("learners");
    const result = { updated: 0, notInClass: [], terms: new Set() };
    for (const row of (Array.isArray(b.rows) ? b.rows : []).slice(0, 200)) {
      const lrn = clean(row.lrn).replace(/\D/g, "");
      const l = lrn.length === 12 && (await learners.get(lrn, { type: "json" }));
      if (!l || !sameSection(sec, l.grade, l.section)) { result.notInClass.push(clean(row.name) || lrn); continue; }
      const card = (await cards.get(lrn, { type: "json" })) || { lrn, terms: {}, attendance: {}, comments: {} };
      for (const t of TERMS) {
        const g = row.terms?.[t];
        if (!g) continue;
        const clean_ = Object.fromEntries(AREAS.map((a) => [a, num(g[a])]).filter(([, v]) => v !== ""));
        if (Object.keys(clean_).length) { card.terms[t] = clean_; result.terms.add(t); }
      }
      if (row.present) {
        for (const mo of MONTHS) { const v = num(row.present[mo]); if (v !== "") card.attendance[mo] = v; }
      }
      if (row.age) card.age = clean(row.age, 4);
      card.updatedAt = Date.now(); card.by = me.name;
      await cards.setJSON(lrn, card);
      result.updated++;
    }
    await logActivity(staffLabel(me), "uploaded SF9 grades", `${sec.grade} – ${sec.name}: ${result.updated} learners, ${[...result.terms].map((t) => t.toUpperCase()).join(", ") || "attendance only"}`, "Report Cards");
    return json({ updated: result.updated, notInClass: result.notInClass, terms: [...result.terms] });
  }

  // Teacher's comments per term and Certificate of Transfer details for one learner
  if (action === "comment") {
    const l = await store("learners").get(clean(b.lrn), { type: "json" });
    if (!l || !canManageLearner(me, l)) return json({ error: "Not your learner." }, 403);
    const card = (await cards.get(l.lrn, { type: "json" })) || { lrn: l.lrn, terms: {}, attendance: {}, comments: {} };
    card.comments = Object.fromEntries(TERMS.map((t) => [t, clean(b.comments?.[t] ?? card.comments?.[t], 600)]));
    if ("admittedTo" in b) card.admittedTo = clean(b.admittedTo, 40);
    if ("eligibleFor" in b) card.eligibleFor = clean(b.eligibleFor, 40);
    await cards.setJSON(l.lrn, card);
    return json(card);
  }

  // Which terms learners can see
  if (action === "release") {
    const sec = (await allSections()).find((s) => s.id === b.sectionId);
    if (!canManageSection(me, sec)) return json({ error: "You are not the adviser of this section." }, 403);
    sec.sf9 = { ...(sec.sf9 || {}), released: Object.fromEntries(TERMS.map((t) => [t, !!b.released?.[t]])) };
    await sections.setJSON(sec.id, sec);
    const shown = TERMS.filter((t) => sec.sf9.released[t]).map((t) => t.toUpperCase()).join(", ") || "none";
    await logActivity(staffLabel(me), "changed report card release", `${sec.grade} – ${sec.name}: learners can see ${shown}`, "Report Cards");
    return json(sec.sf9);
  }

  return json({ error: "Not found" }, 404);
};

export const config = { path: ["/api/grades", "/api/grades/import", "/api/grades/comment", "/api/grades/release"] };
