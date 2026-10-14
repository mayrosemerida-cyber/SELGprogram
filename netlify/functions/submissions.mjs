// Taga-Silangan write-ups.
// Flow: writer/editor/teacher submits → coordinator of that part checks (forward or return)
//       → Taga-Silangan Adviser publishes (or returns). If a part has no coordinator, it goes straight to the adviser.
import { json, getStaff, hasRole, getNewsroom, newId, savePhotos, clean, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";
import { PARTS } from "../lib/newsroom.mjs";

async function coordinatorsFor(part) {
  return (await listJSON("newsroom", "")).filter((a) => a.status === "active" && a.role === "coordinator" && (a.parts || []).includes(part));
}

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // submissions | review
  const subs = store("submissions");

  const staff = await getStaff(req);
  const news = staff ? null : await getNewsroom(req);
  if (!staff && !news) return json({ error: "Please sign in to the Taga-Silangan Newsroom." }, 401);
  const me = staff
    ? { id: `staff:${staff.username}`, name: staff.name, label: staffLabel(staff), adviser: hasRole(staff, "paper") }
    : { id: `news:${news.username}`, name: news.name, label: `${news.name} (newsroom: ${news.username})`, coordinatorOf: news.role === "coordinator" ? news.parts : [] };
  const isCoordinatorFor = (s) => (me.coordinatorOf || []).includes(s.category);

  if (action === "submissions" && req.method === "GET") {
    const all = (await listJSON("submissions", "")).sort((a, b) => b.updatedAt - a.updatedAt);
    if (url.searchParams.get("mine")) return json(all.filter((s) => s.authorId === me.id));
    if (url.searchParams.get("queue")) return json(all.filter((s) => s.status === "pending" && isCoordinatorFor(s)));
    if (me.adviser) return json(all);
    return json(all.filter((s) => s.authorId === me.id));
  }

  // Submit new, or edit & resubmit a returned one
  if (action === "submissions" && req.method === "POST") {
    const form = await req.formData();
    const title = clean(form.get("title"), 160);
    const body = clean(form.get("body"), 40000);
    if (!title || body.length < 20) return json({ error: "Please add a title and your write-up." }, 400);
    const category = PARTS.includes(form.get("category")) ? form.get("category") : "News";

    const editId = form.get("id");
    let sub;
    if (editId) {
      sub = await subs.get(editId, { type: "json" });
      if (!sub || sub.authorId !== me.id) return json({ error: "Not found." }, 404);
      if (sub.status === "published") return json({ error: "This write-up is already published." }, 400);
      const keep = new Set(form.getAll("keepPhotos"));
      for (const k of sub.photos.filter((k) => !keep.has(k))) await store("media").delete(k);
      sub.photos = sub.photos.filter((k) => keep.has(k));
    } else {
      sub = { id: `sub-${newId()}`, authorId: me.id, authorName: me.name, photos: [], history: [], createdAt: Date.now() };
    }
    try { sub.photos.push(...(await savePhotos(form.getAll("photos"), sub.id + "-" + Date.now().toString(36)))); }
    catch (e) { return json({ error: e.message }, 400); }
    if (sub.photos.length > 10) return json({ error: "Up to 10 photos per write-up." }, 400);

    const coords = await coordinatorsFor(category);
    Object.assign(sub, {
      title, body, category, byline: clean(form.get("byline")) || me.name,
      status: coords.length ? "pending" : "checked",
      stage: coords.length ? `Coordinator (${coords.map((c) => c.name).join(", ")})` : "Adviser",
      comment: "", updatedAt: Date.now(),
    });
    sub.history.push({ at: Date.now(), by: me.name, action: editId ? "resubmitted" : "submitted" });
    await subs.setJSON(sub.id, sub);
    await logActivity(me.label, editId ? "resubmitted write-up" : "submitted write-up", `${category}: ${title}`, "Taga-Silangan");
    return json(sub, editId ? 200 : 201);
  }

  // Coordinator: forward/return. Adviser: publish/return.
  if (action === "review" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const sub = b.id && (await subs.get(b.id, { type: "json" }));
    if (!sub) return json({ error: "Not found." }, 404);
    if (sub.status === "published") return json({ error: "Already published." }, 400);
    const asCoordinator = !me.adviser && sub.status === "pending" && isCoordinatorFor(sub);
    if (!me.adviser && !asCoordinator) return json({ error: "You can't review this write-up." }, 403);

    // Edits made by the checker are kept
    if (clean(b.title)) sub.title = clean(b.title, 160);
    if (clean(b.body)) sub.body = clean(b.body, 40000);
    if (PARTS.includes(b.category)) sub.category = b.category;
    if (clean(b.byline)) sub.byline = clean(b.byline);
    const comment = clean(b.comment, 3000);

    if (b.action === "return") {
      if (!comment) return json({ error: "Write a note so the writer knows what to fix." }, 400);
      Object.assign(sub, { status: "returned", stage: "Writer (revising)", comment, updatedAt: Date.now() });
    } else if (b.action === "forward" && asCoordinator) {
      Object.assign(sub, { status: "checked", stage: "Adviser", comment, checkedBy: me.name, updatedAt: Date.now() });
    } else if (b.action === "publish" && me.adviser) {
      const post = {
        id: `news-${newId()}`, type: "news", status: "published", title: sub.title, body: sub.body, category: sub.category,
        author: sub.byline, date: clean(b.date) || new Date().toISOString().slice(0, 10), pinned: 0,
        photos: sub.photos, files: [], authorId: sub.authorId, authorName: sub.authorName, fromSubmission: sub.id, createdAt: Date.now(),
      };
      await store("posts").setJSON(post.id, post);
      Object.assign(sub, { status: "published", stage: "Published", postId: post.id, comment, updatedAt: Date.now() });
    } else return json({ error: "Unknown action." }, 400);

    sub.history.push({ at: Date.now(), by: me.name, action: b.action, comment });
    await subs.setJSON(sub.id, sub);
    const verb = { return: "returned write-up", forward: "checked and forwarded write-up", publish: "published write-up" }[b.action];
    await logActivity(me.label, verb, `${sub.category}: ${sub.title}`, "Taga-Silangan");
    return json(sub);
  }

  if (action === "submissions" && req.method === "DELETE") {
    const sub = await subs.get(url.searchParams.get("id") || "", { type: "json" });
    if (!sub) return json({ error: "Not found." }, 404);
    const own = sub.authorId === me.id && sub.status !== "published";
    if (!me.adviser && !own) return json({ error: "You can't delete this." }, 403);
    if (sub.status !== "published") await Promise.all(sub.photos.map((k) => store("media").delete(k)));
    await subs.delete(sub.id);
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
};

export const config = { path: ["/api/submissions", "/api/submissions/review"] };
