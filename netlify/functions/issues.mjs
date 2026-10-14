// Newspaper issues as PDF. The School Paper Adviser uploads; anyone can download.
// Big PDFs are sent in 4 MB parts because Netlify limits each request to about 6 MB.
import { json, getStaff, hasRole, newId, savePhotos, clean, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON, getFile } from "../lib/store.mjs";

const PART = 4 * 1024 * 1024;
const MAX_SIZE = 80 * 1024 * 1024;

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // issues | part
  const issues = store("issues");
  const parts = store("issuefiles");

  // Public: list finished issues, or fetch one part of a PDF
  if (req.method === "GET") {
    if (action === "part") {
      const issue = await issues.get(url.searchParams.get("id") || "", { type: "json" });
      const n = Number(url.searchParams.get("n"));
      if (!issue || !issue.complete || !(n >= 0 && n < issue.parts)) return new Response("Not found", { status: 404 });
      const file = await getFile("issuefiles", `${issue.id}-${n}`);
      if (!file) return new Response("Not found", { status: 404 });
      // Count a download each time someone starts fetching the first part
      if (n === 0) { issue.downloads = (issue.downloads || 0) + 1; await issues.setJSON(issue.id, issue); }
      return new Response(file.data, {
        headers: { "Content-Type": "application/octet-stream", "Cache-Control": n === 0 ? "no-store" : "public, max-age=31536000, immutable" },
      });
    }
    const me = url.searchParams.get("all") ? await getStaff(req) : null;
    const staffView = hasRole(me, "paper");
    const all = (await listJSON("issues", "")).filter((i) => i.complete || staffView);
    all.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    // Download counts are shown only to the Taga-Silangan Adviser and the Principal
    return json(staffView ? all : all.map(({ downloads, received, by, ...rest }) => rest));
  }

  const me = await getStaff(req);
  if (!hasRole(me, "paper")) return json({ error: "Only the Taga-Silangan Adviser can upload issues." }, 403);

  // Step 1: create the issue (details + optional cover image)
  if (action === "issues" && req.method === "POST") {
    const form = await req.formData();
    const title = clean(form.get("title"), 160);
    const size = Number(form.get("size"));
    if (!title) return json({ error: "Add a title for this issue." }, 400);
    if (!(size > 0) || size > MAX_SIZE) return json({ error: "PDF must be smaller than 80 MB." }, 400);
    const id = `issue-${newId()}`;
    let cover = [];
    try { cover = await savePhotos([form.get("cover")].filter(Boolean), id); }
    catch (e) { return json({ error: e.message }, 400); }
    const issue = {
      id, title,
      volume: clean(form.get("volume"), 100),
      date: clean(form.get("date")) || new Date().toISOString().slice(0, 10),
      fileName: clean(form.get("fileName"), 120) || "newspaper.pdf",
      size, parts: Math.ceil(size / PART), received: [],
      coverKey: cover[0] || "", complete: false, downloads: 0, by: me.username, createdAt: Date.now(),
    };
    await issues.setJSON(id, issue);
    return json({ ...issue, partSize: PART }, 201);
  }

  // Step 2: upload each part (raw bytes)
  if (action === "part" && req.method === "PUT") {
    const issue = await issues.get(url.searchParams.get("id") || "", { type: "json" });
    const n = Number(url.searchParams.get("n"));
    if (!issue || !(n >= 0 && n < issue.parts)) return json({ error: "Not found." }, 404);
    const buf = await req.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > PART) return json({ error: "Bad part size." }, 400);
    if (n === 0 && new TextDecoder().decode(new Uint8Array(buf.slice(0, 5))) !== "%PDF-") {
      return json({ error: "That file is not a PDF." }, 400);
    }
    await parts.set(`${issue.id}-${n}`, buf, { metadata: { contentType: "application/octet-stream" } });
    if (!issue.received.includes(n)) issue.received.push(n);
    const wasComplete = issue.complete;
    issue.complete = issue.received.length === issue.parts;
    await issues.setJSON(issue.id, issue);
    if (issue.complete && !wasComplete) await logActivity(staffLabel(me), "published newspaper issue (PDF)", issue.title, "Taga-Silangan");
    return json({ ok: true, complete: issue.complete });
  }

  if (action === "issues" && req.method === "DELETE") {
    const issue = await issues.get(url.searchParams.get("id") || "", { type: "json" });
    if (!issue) return json({ error: "Not found." }, 404);
    for (let n = 0; n < issue.parts; n++) await parts.delete(`${issue.id}-${n}`);
    if (issue.coverKey) await store("media").delete(issue.coverKey);
    await issues.delete(issue.id);
    await logActivity(staffLabel(me), "deleted newspaper issue", issue.title, "Taga-Silangan");
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
};

export const config = { path: ["/api/issues", "/api/issues/part"] };
