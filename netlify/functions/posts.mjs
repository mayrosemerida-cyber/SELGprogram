// Announcements, SELG activities and Taga-Silangan stories.
// Approval rules:
//   announcement – The Principal's posts go live; other teachers' posts wait for the Principal's approval
//   selg         – SELG Adviser/Admin posts go live; SELG student officers' posts wait for the SELG Adviser
//   news         – Taga-Silangan Adviser/Admin only
import { json, getStaff, hasRole, getLearner, newId, saveFiles, IMAGE_TYPES, clean, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";
import { notifyUsers, usersWithRole } from "../lib/push.mjs";

export const TYPES = ["announcement", "selg", "news"];
const TYPE_LABEL = { announcement: "announcement", selg: "SELG post", news: "Taga-Silangan story" };

const canApprove = (me, type) =>
  !!me && ((type === "announcement" && hasRole(me, "principal")) || (type === "selg" && hasRole(me, "selg")) || (type === "news" && hasRole(me, "paper")));

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // posts | review
  const posts = store("posts");

  // Who's asking: staff or a learner (SELG officers can post SELG activities)
  const me = await getStaff(req);
  const learner = me ? null : await getLearner(req);
  const authorId = me ? `staff:${me.username}` : learner ? `lrn:${learner.lrn}` : null;
  const authorName = me ? me.name : learner ? `${learner.firstName} ${learner.lastName}` : "";

  if (action === "posts" && req.method === "GET") {
    const id = url.searchParams.get("id");
    if (id) {
      const post = await posts.get(id, { type: "json" });
      const visible = post && (post.status === "published" || post.authorId === authorId || canApprove(me, post.type));
      return visible ? json(post) : json({ error: "Not found" }, 404);
    }
    const type = url.searchParams.get("type");
    const all = (await listJSON("posts", type && TYPES.includes(type) ? type + "-" : ""))
      .sort((a, b) => (b.pinned - a.pinned) || b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    if (url.searchParams.get("pending")) {
      return json(all.filter((p) => p.status === "pending" && canApprove(me, p.type)));
    }
    if (url.searchParams.get("mine")) {
      if (!authorId) return json({ error: "Please sign in." }, 401);
      return json(all.filter((p) => p.authorId === authorId));
    }
    if (!TYPES.includes(type)) return json({ error: "Unknown type" }, 400);
    let items = all.filter((p) => p.status === "published");
    const cat = url.searchParams.get("category");
    if (cat) items = items.filter((p) => p.category === cat);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 300);
    return json(items.slice(0, limit));
  }

  if (!authorId) return json({ error: "Please sign in." }, 401);

  if (action === "posts" && req.method === "POST") {
    const form = await req.formData();
    const type = form.get("type");
    if (!TYPES.includes(type)) return json({ error: "Unknown type" }, 400);
    let status;
    if (me) {
      if (type === "announcement") status = hasRole(me, "principal") ? "published" : "pending";
      else if (type === "selg") { if (!hasRole(me, "selg")) return json({ error: "Only the SELG Adviser can post SELG activities." }, 403); status = "published"; }
      else { if (!hasRole(me, "paper")) return json({ error: "Only the Taga-Silangan Adviser can post stories here." }, 403); status = "published"; }
    } else {
      if (type !== "selg" || !learner.selgOfficer) return json({ error: "Only SELG officers can post here." }, 403);
      status = "pending";
    }
    const title = clean(form.get("title"), 160);
    if (!title) return json({ error: "Title is required." }, 400);

    const id = `${type}-${newId()}`;
    let photos, files;
    try {
      photos = (await saveFiles(form.getAll("photos"), id, { types: IMAGE_TYPES, label: "Photo" })).map((f) => f.key);
      files = await saveFiles(form.getAll("files"), id + "-doc", { types: ["application/pdf"], label: "Report (PDF only)" });
    } catch (e) { return json({ error: e.message }, 400); }

    const post = {
      id, type, title, status,
      body: clean(form.get("body"), 30000),
      category: clean(form.get("category")),
      author: clean(form.get("author")) || (learner ? `${authorName}, SELG` : ""),
      date: clean(form.get("date")) || new Date().toISOString().slice(0, 10),
      pinned: form.get("pinned") === "on" && hasRole(me, "principal") ? 1 : 0,
      photos, files, authorId, authorName,
      createdAt: Date.now(),
    };
    await posts.setJSON(id, post);
    if (status === "pending") {
      const who = type === "announcement" ? await usersWithRole("principal") : type === "selg" ? await usersWithRole("selg") : await usersWithRole("paper");
      await notifyUsers(who.filter((u) => u !== me?.username), { title: "📢 Waiting for your approval", body: `${authorName}: ${title}`, url: "/admin.html#approvals", tag: id });
    }
    await logActivity(me ? staffLabel(me) : `${authorName} (LRN ${learner.lrn})`, status === "pending" ? `submitted ${TYPE_LABEL[type]} for approval` : `posted ${TYPE_LABEL[type]}`, title, type === "selg" ? "SELG" : type === "news" ? "Taga-Silangan" : "Announcements");
    return json(post, 201);
  }

  // Approve or disapprove a pending post
  if (action === "review" && req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const post = b.id && (await posts.get(b.id, { type: "json" }));
    if (!post) return json({ error: "Not found" }, 404);
    if (!canApprove(me, post.type)) return json({ error: "You can't approve this." }, 403);
    post.status = b.action === "approve" ? "published" : "rejected";
    post.reviewNote = clean(b.note, 1000);
    post.reviewedBy = me.name;
    if (post.status === "published") post.date = new Date().toISOString().slice(0, 10);
    await posts.setJSON(post.id, post);
    await logActivity(staffLabel(me), post.status === "published" ? `approved ${TYPE_LABEL[post.type]}` : `disapproved ${TYPE_LABEL[post.type]}`, post.title, "Approvals");
    return json(post);
  }

  if (action === "posts" && req.method === "DELETE") {
    const id = url.searchParams.get("id");
    const post = id && (await posts.get(id, { type: "json" }));
    if (!post) return json({ error: "Not found" }, 404);
    const own = post.authorId === authorId && post.status !== "published";
    if (!own && !canApprove(me, post.type)) return json({ error: "You can't delete this." }, 403);
    const media = store("media");
    await Promise.all([...post.photos, ...(post.files || []).map((f) => f.key)].map((k) => media.delete(k)));
    await posts.delete(id);
    await logActivity(me ? staffLabel(me) : authorName, `deleted ${TYPE_LABEL[post.type]}`, post.title, "Posts");
    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: ["/api/posts", "/api/posts/review"] };
