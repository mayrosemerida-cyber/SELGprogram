// Excuse letters: a learner sends one when absent; their class adviser (and the Principal) approve or disapprove.
import {
  json, getStaff, getLearner, sectionOfLearner, hasRole, canManageLearner, newId, clean, saveFiles, IMAGE_TYPES, logActivity, staffLabel,
} from "../lib/auth.mjs";
import { store, listJSON, getFile } from "../lib/store.mjs";
import { notifyUsers } from "../lib/push.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // excuses | decide | file
  const ex = store("excuses");
  const me = await getStaff(req);
  const learner = me ? null : await getLearner(req);
  if (!me && !learner) return json({ error: "Please sign in." }, 401);

  const canSee = async (e) => {
    if (learner) return e.lrn === learner.lrn;
    const l = await store("learners").get(e.lrn, { type: "json" });
    return !!l && canManageLearner(me, l);
  };

  if (action === "file") {
    const e = await ex.get(url.searchParams.get("id") || "", { type: "json" });
    if (!e || !e.attachment || !(await canSee(e))) return new Response("Not found", { status: 404 });
    const f = await getFile("private", e.attachment.key);
    return f ? new Response(f.data, { headers: { "Content-Type": f.contentType, "Cache-Control": "private, no-store" } }) : new Response("Not found", { status: 404 });
  }

  if (req.method === "GET") {
    const all = (await listJSON("excuses", "")).sort((a, b) => b.createdAt - a.createdAt);
    if (learner) return json(all.filter((e) => e.lrn === learner.lrn));
    const learners = Object.fromEntries((await listJSON("learners", "")).map((l) => [l.lrn, l]));
    return json(all.filter((e) => learners[e.lrn] && canManageLearner(me, learners[e.lrn])));
  }

  if (action === "excuses" && req.method === "POST") {
    if (!learner) return json({ error: "Only learners send excuse letters." }, 403);
    const form = await req.formData();
    const dateFrom = clean(form.get("dateFrom")), dateTo = clean(form.get("dateTo")) || dateFrom;
    const reason = clean(form.get("reason"), 2000);
    if (!dateFrom || reason.length < 5) return json({ error: "Enter the date(s) you were absent and the reason." }, 400);
    let files = [];
    try { files = await saveFiles([form.get("attachment")].filter(Boolean), `excuse-${learner.lrn}`, { storeName: "private", types: [...IMAGE_TYPES, "application/pdf"], label: "Attachment" }); }
    catch (e) { return json({ error: e.message }, 400); }
    const e = {
      id: `ex-${newId()}`, lrn: learner.lrn, name: `${learner.firstName} ${learner.lastName}`,
      grade: learner.grade, section: learner.section, dateFrom, dateTo, reason,
      parent: clean(form.get("parent"), 120), attachment: files[0] || null,
      status: "pending", createdAt: Date.now(),
    };
    await ex.setJSON(e.id, e);
    const sec = await sectionOfLearner(learner);
    if (sec?.adviser) await notifyUsers([sec.adviser], { title: "✉️ New excuse letter", body: `${e.name}: absent ${dateFrom}${dateTo !== dateFrom ? " to " + dateTo : ""}`, url: "/admin.html#class", tag: e.id });
    await logActivity(`${e.name} (LRN ${e.lrn})`, "sent an excuse letter", `${dateFrom}${dateTo !== dateFrom ? " to " + dateTo : ""}`, "Learner Portal");
    return json(e, 201);
  }

  if (action === "decide" && req.method === "POST") {
    if (!me) return json({ error: "Only teachers can approve excuse letters." }, 403);
    const b = await req.json().catch(() => ({}));
    const e = b.id && (await ex.get(b.id, { type: "json" }));
    if (!e || !(await canSee(e))) return json({ error: "Not found." }, 404);
    e.status = b.action === "approve" ? "approved" : "disapproved";
    e.note = clean(b.note, 1000); e.decidedBy = me.name; e.decidedAt = Date.now();
    await ex.setJSON(e.id, e);
    await logActivity(staffLabel(me), `${e.status} excuse letter`, e.name, "Class");
    return json(e);
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/excuses", "/api/excuses/decide", "/api/excuses/file"] };
