// Class announcements and assignments: the adviser posts, only learners in that section can see them.
import {
  json, getStaff, getLearner, allSections, sectionOfLearner, canManageSection, newId, clean,
  saveFiles, IMAGE_TYPES, DOC_TYPES, logActivity, staffLabel,
} from "../lib/auth.mjs";
import { store, listJSON, getFile } from "../lib/store.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // classposts | file
  const cp = store("classposts");
  const me = await getStaff(req);
  const learner = me ? null : await getLearner(req);

  // Which section are we talking about, and may this person see it?
  async function resolveSection(id) {
    if (learner) return sectionOfLearner(learner);
    const sec = (await allSections()).find((s) => s.id === id);
    return canManageSection(me, sec) ? sec : null;
  }

  if (req.method === "GET" && action === "file") {
    const post = await cp.get(url.searchParams.get("id") || "", { type: "json" });
    const sec = post && (await resolveSection(post.sectionId));
    if (!post || !sec || sec.id !== post.sectionId) return new Response("Not found", { status: 404 });
    const f = post.files[Number(url.searchParams.get("n"))];
    const file = f && (await getFile("private", f.key));
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.data, { headers: { "Content-Type": file.contentType, "Content-Disposition": `inline; filename="${f.name.replace(/"/g, "")}"`, "Cache-Control": "private, no-store" } });
  }

  if (req.method === "GET") {
    if (!me && !learner) return json({ error: "Please sign in." }, 401);
    const sec = await resolveSection(url.searchParams.get("section"));
    if (!sec) return json({ error: learner ? "Your section isn't set up yet." : "Not your section." }, learner ? 404 : 403);
    const items = (await listJSON("classposts", sec.id + "--")).sort((a, b) => b.createdAt - a.createdAt);
    return json({ section: { id: sec.id, grade: sec.grade, name: sec.name }, items });
  }

  if (!me) return json({ error: "Only the class adviser can post here." }, 401);

  if (req.method === "POST") {
    const form = await req.formData();
    const sec = await resolveSection(form.get("section"));
    if (!sec) return json({ error: "You are not the adviser of this section." }, 403);
    const title = clean(form.get("title"), 160);
    if (!title) return json({ error: "Title is required." }, 400);
    const id = `${sec.id}--${newId()}`;
    let files;
    try { files = await saveFiles(form.getAll("files"), `class-${id}`, { storeName: "private", types: [...IMAGE_TYPES, ...DOC_TYPES], label: "Attachment" }); }
    catch (e) { return json({ error: e.message }, 400); }
    const post = {
      id, sectionId: sec.id, type: form.get("type") === "assignment" ? "assignment" : "announcement",
      title, body: clean(form.get("body"), 10000), dueDate: clean(form.get("dueDate")),
      files, by: me.name, createdAt: Date.now(),
    };
    await cp.setJSON(id, post);
    await logActivity(staffLabel(me), `posted class ${post.type}`, `${sec.grade} – ${sec.name}: ${title}`, "Class");
    return json(post, 201);
  }

  if (req.method === "DELETE") {
    const post = await cp.get(url.searchParams.get("id") || "", { type: "json" });
    const sec = post && (await resolveSection(post.sectionId));
    if (!post || !sec) return json({ error: "Not found" }, 404);
    await Promise.all(post.files.map((f) => store("private").delete(f.key)));
    await cp.delete(post.id);
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/classposts", "/api/classposts/file"] };
