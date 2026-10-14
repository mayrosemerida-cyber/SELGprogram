// ===== Staff Dashboard: approvals, announcements, SELG, Taga-Silangan, org chart, site settings =====
const ANN_CATEGORIES = ["Contest Winners", "Examination Schedule", "School Events", "Holiday / No Classes", "Enrollment", "Parents & Guardians", "General"];
const TYPE_NAME = { announcement: "Announcement", selg: "SELG post", news: "Taga-Silangan story" };

// Generic post form + list (announcements, SELG, stories)
function postForm(type, { cats, pdf = false, author = false, intro = "" } = {}) {
  return `<form class="form post-form" data-type="${type}">
    <input type="hidden" name="type" value="${type}">
    ${intro ? `<p class="hint" style="margin:0 0 14px">${intro}</p>` : ""}
    <label>Title</label><input name="title" required maxlength="160">
    <div class="row2"><div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
      <div><label>Category</label><select name="category">${cats.map((c) => `<option>${esc(c)}</option>`).join("")}</select></div></div>
    ${author ? `<label>Byline</label><input name="author">` : ""}
    <label>Details (optional if you upload a poster)</label><textarea name="body" rows="5"></textarea>
    <label>Photos or poster (JPG / PNG)</label><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>
    ${pdf ? `<label>Activity report (PDF)</label><input name="files" type="file" accept="application/pdf" multiple>` : ""}
    ${type === "announcement" && isPrincipal() ? `<label class="checkbox"><input type="checkbox" name="pinned"> Pin to top</label>` : ""}
    <button class="btn navy" type="submit">Post</button>
  </form>`;
}
function wirePostForm(form, done) {
  form.onsubmit = (e) => {
    e.preventDefault();
    act($("button[type=submit]", form), async () => {
      const fd = new FormData(form);
      fd.delete("photos");
      for (const f of form.photos.files) fd.append("photos", await resizeImage(f, 1800, 0.85));
      let total = 0; for (const [, v] of fd) if (v instanceof Blob) total += v.size;
      if (total > 5.5 * 1024 * 1024) throw new Error("Too many or too large files at once. Post fewer photos, or compress the PDF.");
      const post = await api("/api/posts", { method: "POST", body: fd });
      form.reset(); form.date.value = today(); done?.();
      return post;
    }, (p) => p.status === "pending" ? "Submitted! It will appear on the website after approval." : "Posted! It's now live on the website.");
  };
}
const postRow = (p, { del = true } = {}) => `<li><span><strong>${esc(p.title)}</strong><br><small class="date">${fmtDate(p.date)}${p.category ? " · " + esc(p.category) : ""} · ${p.photos.length} photo(s)${p.files?.length ? ` · ${p.files.length} PDF` : ""}${p.authorName ? " · " + esc(p.authorName) : ""}${p.reviewNote ? " · Note: " + esc(p.reviewNote) : ""}</small></span>
  <span style="display:flex;gap:6px;align-items:center;flex:none">${pill(p.status, { published: "Live", pending: "Waiting for approval", rejected: "Not approved" }[p.status])}${del ? `<button class="small-btn danger" data-pdel="${esc(p.id)}">Delete</button>` : ""}</span></li>`;
function wirePostDeletes(list, reload) {
  list.onclick = (e) => { const id = e.target.dataset.pdel; if (id && confirm("Delete this post and its files?")) act(null, () => api(`/api/posts?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(reload), "Deleted."); };
}

/* ---------------- Approvals ---------------- */
registerTab({
  id: "approvals", label: "✅ Approvals", show: () => isHead() || can("selg"),
  render: (p) => loadApprovals(p), refresh: (p) => loadApprovals(p),
});
async function loadApprovals(p) {
  const [posts, staff] = await Promise.all([api("/api/posts?pending=1"), isHead() ? api("/api/admin/staff") : []]);
  const pendStaff = staff.filter((s) => s.status === "pending");
  p.innerHTML = `${pendStaff.length ? `<div class="card" style="margin-bottom:20px;border-color:var(--gold)"><h3>New staff account requests (${pendStaff.length})</h3>
      <p>${pendStaff.map((s) => esc(s.name)).join(", ")}</p><a class="small-btn" href="#" data-goto="staff">Review in Staff →</a></div>` : ""}
    <div class="card"><h3>Posts waiting for approval (${posts.length})</h3>
    ${posts.length ? posts.map((x) => `<article class="ann" style="grid-template-columns:1fr;border-bottom:1px solid var(--line)">
      <div><span class="tag">${TYPE_NAME[x.type]}</span>${x.category ? ` <span class="tag">${esc(x.category)}</span>` : ""}
        <h3 style="margin-top:8px">${esc(x.title)}</h3>
        <div class="date">From ${esc(x.authorName)} · ${fmtDT(x.createdAt)}</div>
        ${x.body ? `<div class="body">${esc(x.body)}</div>` : ""}
        ${x.photos.length ? `<div class="thumbs">${x.photos.map((k) => `<img src="${mediaUrl(k)}" alt="" data-zoom>`).join("")}</div>` : ""}
        ${filesHTML(x.files)}
        <div class="inline-form" style="margin-top:12px"><input data-note="${x.id}" placeholder="Note to the author (optional)" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid #cfc8b8;border-radius:8px;font:inherit">
          <button class="small-btn" data-rev="${x.id}" data-a="approve">✅ Approve &amp; publish</button><button class="small-btn danger" data-rev="${x.id}" data-a="reject">Disapprove</button></div>
      </div></article>`).join("") : `<p class="date">Nothing waiting. 🎉</p>`}</div>`;
  p.onclick = (e) => {
    const id = e.target.dataset.rev; if (!id) return;
    act(e.target, () => postJSON("/api/posts/review", { id, action: e.target.dataset.a, note: $(`[data-note="${id}"]`, p).value }).then(() => { loadApprovals(p); refreshBadges(); }),
      e.target.dataset.a === "approve" ? "Approved. It's now on the website." : "Disapproved. The author can see your note.");
  };
}

/* ---------------- Announcements ---------------- */
registerTab({
  id: "announcements", label: "📢 Announcements", show: () => true,
  render: (p) => {
    p.innerHTML = `<div class="grid grid-2" style="align-items:start">
      <div class="card"><h3>Post an announcement or schedule</h3>${postForm("announcement", { cats: ANN_CATEGORIES, intro: isPrincipal() ? "Your posts go live right away." : "Upload a JPG/PNG poster (e.g. contest winners, exam schedule). The Principal approves it before it appears." })}</div>
      <div class="card"><h3>${isHead() ? "All announcements" : "My announcements"}</h3><ul class="admin-list" id="ann-admin-list"></ul></div></div>`;
    const reload = () => loadAnnList(p);
    wirePostForm($(".post-form", p), reload); wirePostDeletes($("#ann-admin-list", p), reload); reload();
  },
  refresh: (p) => loadAnnList(p),
});
async function loadAnnList(p) {
  let items = await api("/api/posts?type=announcement&mine=1");
  if (isHead()) {
    const live = await api("/api/posts?type=announcement");
    const ids = new Set(items.map((x) => x.id)); items = [...items, ...live.filter((x) => !ids.has(x.id))];
  }
  $("#ann-admin-list", p).innerHTML = items.length ? items.map((x) => postRow(x)).join("") : `<li class="date">Nothing posted yet.</li>`;
}

/* ---------------- SELG ---------------- */
registerTab({
  id: "selg", label: "🏛️ SELG", show: () => can("selg"),
  render: (p) => {
    p.innerHTML = `<div class="subtabs"><button class="active" data-sub="post">Post activity</button><button data-sub="people">Officers &amp; advisers</button><button data-sub="posters">Student officers' access</button></div>
      <div class="subpanel active" data-subpanel="post"><div class="grid grid-2" style="align-items:start">
        <div class="card"><h3>Post an SELG activity, announcement or report</h3>${postForm("selg", { cats: ["Activity", "Announcement", "Project", "Report", "Meeting", "Outreach"], pdf: true })}</div>
        <div class="card"><h3>SELG posts</h3><ul class="admin-list" id="selg-posts"></ul></div></div></div>
      <div class="subpanel" data-subpanel="people">${peopleEditor("selg")}</div>
      <div class="subpanel" data-subpanel="posters"><div class="grid grid-2" style="align-items:start">
        <div class="card"><h3>Let an SELG officer post</h3><p>Officers sign in to the Learner Portal and see an <strong>SELG Posts</strong> tab. Their posts wait for your approval (in Approvals).</p>
          <form id="poster-form" class="form"><label>Learner LRN</label><input name="lrn" inputmode="numeric" maxlength="12" required><button class="btn navy" type="submit">Give access</button></form></div>
        <div class="card"><h3>Officers who can post</h3><ul class="admin-list" id="poster-list"></ul></div></div></div>`;
    wireSubtabs(p);
    const reload = async () => { const items = await api("/api/posts?type=selg&mine=1"); const live = await api("/api/posts?type=selg"); const ids = new Set(items.map((x) => x.id));
      $("#selg-posts", p).innerHTML = [...items, ...live.filter((x) => !ids.has(x.id))].map((x) => postRow(x)).join("") || `<li class="date">Nothing posted yet.</li>`; };
    wirePostForm($(".post-form", p), reload); wirePostDeletes($("#selg-posts", p), reload); reload();
    wirePeopleEditor(p, "selg");
    const loadPosters = async () => { const items = await api("/api/selg/officers");
      $("#poster-list", p).innerHTML = items.length ? items.map((l) => `<li><span><strong>${esc(l.name)}</strong><br><small class="date">LRN ${l.lrn} · ${esc([l.grade, l.section].filter(Boolean).join(" – "))}</small></span><button class="small-btn danger" data-unposter="${l.lrn}">Remove</button></li>`).join("") : `<li class="date">No officers given access yet.</li>`; };
    $("#poster-form", p).onsubmit = (e) => { e.preventDefault(); act($("button", e.target), () => postJSON("/api/selg/officers", { lrn: e.target.lrn.value }).then((l) => { e.target.reset(); loadPosters(); return l; }), (l) => `${l.name} can now post SELG activities.`); };
    $("#poster-list", p).onclick = (e) => { const lrn = e.target.dataset.unposter; if (lrn) act(null, () => api(`/api/selg/officers?lrn=${lrn}`, { method: "DELETE" }).then(loadPosters), "Removed."); };
    loadPosters();
  },
});

/* ---------------- People editor (org chart, committees, SELG) ---------------- */
function peopleEditor(group) {
  const extra = group === "org"
    ? `<div class="row2"><div><label>Level on the chart</label><select name="level"><option value="1">1 – Top (e.g. Principal)</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option></select></div><div><label>Order within the level</label><input name="order" type="number" value="0"></div></div>`
    : group === "committee"
      ? `<label>Committee</label><input name="committee" list="committee-names" required placeholder="e.g. Brigada Eskwela Committee"><datalist id="committee-names"></datalist><label>Order</label><input name="order" type="number" value="0">`
      : `<div class="row2"><div><label>School year</label><input name="schoolYear" placeholder="2026–2027"></div><div><label>Order</label><input name="order" type="number" value="0"></div></div>`;
  return `<div class="grid grid-2" style="align-items:start">
    <div class="card"><h3 data-ptitle>Add a person</h3>
      <form class="form people-form" data-group="${group}"><input type="hidden" name="id"><input type="hidden" name="group" value="${group}">
        <label>Name</label><input name="name" required>
        <label>Position / role</label><input name="position" required placeholder="${group === "selg" ? "e.g. President, SELG Adviser" : group === "committee" ? "e.g. Chairperson, Member" : "e.g. Principal II, Master Teacher I"}">
        ${extra}
        <label>Photo</label><input name="photo" type="file" accept="image/*">
        <div class="btn-row"><button class="btn navy" type="submit">Save</button><button class="small-btn" type="button" data-preset>Clear</button></div>
      </form></div>
    <div class="card"><h3>${group === "org" ? "Organizational chart" : group === "committee" ? "Committees" : "SELG officers & advisers"}</h3><ul class="admin-list people-list"></ul></div></div>`;
}
function wirePeopleEditor(root, group) {
  const f = $(`.people-form[data-group="${group}"]`, root), list = f.closest(".grid").querySelector(".people-list");
  let items = [];
  const reset = () => { f.reset(); f.id.value = ""; f.closest(".card").querySelector("[data-ptitle]").textContent = "Add a person"; };
  const load = async () => {
    items = await api(`/api/people?group=${group}`);
    if (group === "committee") $("#committee-names", root).innerHTML = [...new Set(items.map((x) => x.committee))].map((c) => `<option value="${esc(c)}">`).join("");
    list.innerHTML = items.length ? items.map((x) => `<li><span style="display:flex;gap:10px;align-items:center"><span class="avatar-sm">${x.photoKey ? `<img src="${mediaUrl(x.photoKey)}" alt="">` : "👤"}</span>
      <span><strong>${esc(x.name)}</strong><br><small class="date">${esc(x.position)}${group === "org" ? " · level " + x.level : ""}${x.committee ? " · " + esc(x.committee) : ""}${x.schoolYear ? " · " + esc(x.schoolYear) : ""}</small></span></span>
      <span style="display:flex;gap:6px"><button class="small-btn" data-pedit="${x.id}">Edit</button><button class="small-btn danger" data-pdel="${x.id}">Delete</button></span></li>`).join("") : `<li class="date">No one added yet.</li>`;
  };
  $("[data-preset]", f).onclick = reset;
  f.onsubmit = (e) => { e.preventDefault(); act($("button[type=submit]", f), async () => {
    const fd = new FormData(f); fd.delete("photo");
    if (f.photo.files[0]) fd.append("photo", await resizeImage(f.photo.files[0], 700, 0.88));
    await api("/api/people", { method: "POST", body: fd }); reset(); load();
  }, "Saved."); };
  list.onclick = (e) => {
    const { pedit, pdel } = e.target.dataset;
    if (pedit) { const x = items.find((i) => i.id === pedit); ["id", "name", "position", "level", "committee", "order", "schoolYear"].forEach((k) => f[k] && (f[k].value = x[k] ?? "")); f.closest(".card").querySelector("[data-ptitle]").textContent = `Edit ${x.name}`; f.scrollIntoView({ behavior: "smooth" }); }
    if (pdel && confirm("Remove this person?")) act(null, () => api(`/api/people?id=${encodeURIComponent(pdel)}`, { method: "DELETE" }).then(load), "Removed.");
  };
  load();
}

/* ---------------- Org chart & committees ---------------- */
registerTab({
  id: "org", label: "🧭 Org Chart", show: () => isHead(),
  render: (p) => {
    p.innerHTML = `<div class="subtabs"><button class="active" data-sub="org">Organizational chart</button><button data-sub="committee">Committees</button></div>
      <div class="subpanel active" data-subpanel="org">${peopleEditor("org")}</div><div class="subpanel" data-subpanel="committee">${peopleEditor("committee")}</div>`;
    wireSubtabs(p); wirePeopleEditor(p, "org"); wirePeopleEditor(p, "committee");
  },
});

/* ---------------- Taga-Silangan ---------------- */
let NEWS_META = null, SUBS = [];
const SUB_LABEL = { pending: "With coordinator", checked: "Ready for you", returned: "Returned", published: "Published" };
registerTab({
  id: "paper", label: "📰 Taga-Silangan", show: () => can("paper"),
  render: async (p) => {
    NEWS_META = NEWS_META || (await api("/api/newsroom/parts"));
    p.innerHTML = `<div class="subtabs"><button class="active" data-sub="review">Review &amp; publish</button><button data-sub="accounts">Newsroom accounts</button><button data-sub="issues">PDF issues &amp; downloads</button><button data-sub="direct">Post a story directly</button><button data-sub="design">🎨 Page design &amp; Facebook</button></div>
      <div class="subpanel" data-subpanel="design" id="paper-design"></div>
      <div class="subpanel active" data-subpanel="review">
        <div class="card"><div class="inline-form" style="margin-bottom:10px"><select id="sub-filter" style="padding:8px;border-radius:8px;border:1px solid #cfc8b8;font:inherit"><option value="">All</option>${Object.entries(SUB_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
          <select id="sub-part" style="padding:8px;border-radius:8px;border:1px solid #cfc8b8;font:inherit"><option value="">All sections</option>${NEWS_META.parts.map((x) => `<option>${esc(x)}</option>`).join("")}</select></div>
          <ul class="admin-list" id="review-list"></ul></div>
        <div class="card" id="review-editor" style="margin-top:20px" hidden></div></div>
      <div class="subpanel" data-subpanel="accounts"><div class="grid grid-2" style="align-items:start">
        <div class="card"><h3 id="nr-form-title">Create a newsroom account</h3>
          <p class="hint" style="margin:0 0 14px">Writers, editors and coordinators sign in at the <a href="newsroom.html" target="_blank">Newsroom page</a>, separate from the Learner Portal.</p>
          <form id="nr-acct-form" class="form"><input type="hidden" name="isNew" value="1">
            <div class="row2"><div><label>Full name</label><input name="name" required></div><div><label>Username</label><input name="username" required autocapitalize="none"></div></div>
            <div class="row2"><div><label>Role</label><select name="role"><option value="writer">Writer</option><option value="editor">Editor</option><option value="coordinator">Coordinator</option></select></div>
              <div><label>Grade &amp; section (optional)</label><input name="gradeSection"></div></div>
            <div data-coord><label>Sections this coordinator checks</label>${NEWS_META.parts.map((x) => `<label class="checkbox" style="margin-bottom:6px;font-weight:400"><input type="checkbox" name="parts" value="${esc(x)}"> ${esc(x)}</label>`).join("")}</div>
            <label data-pwl>Password</label><input name="password" type="text" autocomplete="off">
            <p class="hint">At least 10 characters with letters and numbers, not containing their name or username.</p>
            <div class="btn-row"><button class="btn navy" type="submit">Save account</button><button class="small-btn" type="button" id="nr-acct-reset">Clear</button></div>
          </form></div>
        <div class="card"><h3>Newsroom staff</h3><ul class="admin-list" id="nr-acct-list"></ul></div></div></div>
      <div class="subpanel" data-subpanel="issues"><div class="grid grid-2" style="align-items:start">
        <div class="card"><h3>Upload an issue (PDF)</h3>
          <form id="issue-form" class="form"><label>Title</label><input name="title" placeholder="e.g. Taga-Silangan, First Semester Issue" required>
            <div class="row2"><div><label>Volume / Issue no.</label><input name="volume" placeholder="Vol. 1, No. 1"></div><div><label>Date published</label><input name="date" type="date" value="${today()}" required></div></div>
            <label>PDF file (up to 80 MB)</label><input name="pdf" type="file" accept="application/pdf" required>
            <label>Cover image (optional)</label><input name="cover" type="file" accept="image/*">
            <button class="btn navy" type="submit">Upload &amp; publish</button><div id="issue-progress" class="hint" style="margin:12px 0 0"></div></form></div>
        <div class="card"><h3>Issues and downloads</h3><ul class="admin-list" id="issue-list"></ul></div></div></div>
      <div class="subpanel" data-subpanel="direct"><div class="grid grid-2" style="align-items:start">
        <div class="card"><h3>Post a story directly</h3>${postForm("news", { cats: NEWS_META.parts, author: true })}</div>
        <div class="card"><h3>Published stories</h3><ul class="admin-list" id="news-list"></ul></div></div></div>`;
    wireSubtabs(p, (sub) => ({ review: () => loadSubs(p), accounts: () => loadAccounts(p), issues: () => loadIssues(p), direct: () => loadStories(p), design: () => loadPaperDesign(p) }[sub]?.()));
    $("#sub-filter", p).onchange = () => drawSubs(p); $("#sub-part", p).onchange = () => drawSubs(p);
    wirePostForm($(".post-form", p), () => loadStories(p)); wirePostDeletes($("#news-list", p), () => loadStories(p));
    wireAccounts(p); wireIssues(p); wireReview(p);
    loadSubs(p);
  },
  refresh: (p) => loadSubs(p),
});
async function loadSubs(p) { SUBS = await api("/api/submissions"); drawSubs(p); refreshBadges(); }
function drawSubs(p) {
  const st = $("#sub-filter", p).value, part = $("#sub-part", p).value;
  const order = { checked: 0, pending: 1, returned: 2, published: 3 };
  const rows = SUBS.filter((s) => (!st || s.status === st) && (!part || s.category === part)).sort((a, b) => order[a.status] - order[b.status] || b.updatedAt - a.updatedAt);
  $("#review-list", p).innerHTML = rows.length ? rows.map((s) => `<li><span><strong>${esc(s.title)}</strong><br><small class="date">${esc(s.category)} · by ${esc(s.byline || s.authorName)} · ${fmtDT(s.updatedAt)}${s.checkedBy ? " · checked by " + esc(s.checkedBy) : ""}</small></span>
    <span style="display:flex;gap:6px;align-items:center;flex:none">${pill(s.status, SUB_LABEL[s.status])}
      ${s.status === "published" ? `<a class="small-btn" href="article.html?id=${encodeURIComponent(s.postId)}" target="_blank">View</a>` : `<button class="small-btn" data-review="${s.id}">Open</button>`}
      <button class="small-btn danger" data-sdel="${s.id}">Delete</button></span></li>`).join("") : `<li class="date">No write-ups here.</li>`;
}
function wireReview(p) {
  $("#review-list", p).onclick = (e) => {
    const { review, sdel } = e.target.dataset;
    if (sdel && confirm("Delete this write-up? (A published story stays on the site.)")) act(null, () => api(`/api/submissions?id=${encodeURIComponent(sdel)}`, { method: "DELETE" }).then(() => loadSubs(p)), "Deleted.");
    if (!review) return;
    const s = SUBS.find((x) => x.id === review), box = $("#review-editor", p);
    box.hidden = false;
    box.innerHTML = `<h3>${esc(s.title)}</h3>
      <div class="review-meta"><span>By <strong>${esc(s.authorName)}</strong></span><span>${pill(s.status, SUB_LABEL[s.status])}</span>${s.checkedBy ? `<span>Checked by ${esc(s.checkedBy)}</span>` : ""}</div>
      ${s.history?.length ? `<details style="margin-bottom:12px"><summary class="date">History (${s.history.length})</summary><ul>${s.history.map((h) => `<li class="date">${fmtDT(h.at)} · ${esc(h.by)} ${esc(h.action)}${h.comment ? ": " + esc(h.comment) : ""}</li>`).join("")}</ul></details>` : ""}
      <form class="form" id="review-form">
        <label>Headline</label><input name="title" value="${esc(s.title)}">
        <div class="row2"><div><label>Section</label><select name="category">${NEWS_META.parts.map((x) => `<option ${x === s.category ? "selected" : ""}>${esc(x)}</option>`).join("")}</select></div>
          <div><label>Publish date</label><input name="date" type="date" value="${today()}"></div></div>
        <label>Byline</label><input name="byline" value="${esc(s.byline || s.authorName)}">
        <label>Text</label><textarea name="body" rows="14">${esc(s.body)}</textarea>
        ${s.photos.length ? `<div class="thumbs" style="margin:0 0 18px">${s.photos.map((k) => `<img src="${mediaUrl(k)}" alt="" data-zoom>`).join("")}</div>` : ""}
        <label>Note to the writer (needed when returning)</label><textarea name="comment" rows="3"></textarea>
        <div class="btn-row"><button class="btn navy" type="button" data-act="publish">✅ Publish online</button><button class="btn" type="button" data-act="return">↩️ Return for revision</button><button class="small-btn" type="button" data-act="close">Close</button></div>
      </form>`;
    box.scrollIntoView({ behavior: "smooth" });
    box.onclick = (ev) => {
      const a = ev.target.dataset.act; if (!a) return;
      if (a === "close") { box.hidden = true; return; }
      if (a === "publish" && !confirm("Publish this story on the website now?")) return;
      const f = $("#review-form", box);
      act(ev.target, () => postJSON("/api/submissions/review", { id: s.id, action: a, title: f.title.value, category: f.category.value, date: f.date.value, byline: f.byline.value, body: f.body.value, comment: f.comment.value })
        .then(() => { box.hidden = true; loadSubs(p); }), a === "publish" ? "Published on the Taga-Silangan page." : "Returned to the writer with your note.");
    };
  };
}
let NR_ACCTS = [];
function wireAccounts(p) {
  const f = $("#nr-acct-form", p);
  const sync = () => ($("[data-coord]", f).hidden = f.role.value !== "coordinator");
  f.role.onchange = sync; sync();
  const reset = () => { f.reset(); f.isNew.value = "1"; f.username.readOnly = false; $("#nr-form-title", p).textContent = "Create a newsroom account"; $("[data-pwl]", f).textContent = "Password"; sync(); };
  $("#nr-acct-reset", p).onclick = reset;
  f.onsubmit = (e) => { e.preventDefault(); act($("button[type=submit]", f), () => postJSON("/api/newsroom/accounts", {
    isNew: f.isNew.value === "1", name: f.name.value, username: f.username.value, role: f.role.value, gradeSection: f.gradeSection.value,
    parts: $$("input[name=parts]:checked", f).map((c) => c.value), password: f.password.value,
  }).then(() => { reset(); loadAccounts(p); }), "Saved. Give them their username and password privately."); };
  $("#nr-acct-list", p).onclick = (e) => {
    const { aedit, atoggle, adel } = e.target.dataset;
    const a = NR_ACCTS.find((x) => x.username === (aedit || atoggle || adel));
    if (aedit) { f.isNew.value = ""; f.name.value = a.name; f.username.value = a.username; f.username.readOnly = true; f.role.value = a.role; f.gradeSection.value = a.gradeSection || ""; f.password.value = "";
      $$("input[name=parts]", f).forEach((c) => (c.checked = (a.parts || []).includes(c.value))); sync();
      $("#nr-form-title", p).textContent = `Edit ${a.name}`; $("[data-pwl]", f).textContent = "New password (leave blank to keep)"; f.scrollIntoView({ behavior: "smooth" }); }
    if (atoggle) act(null, () => postJSON("/api/newsroom/accounts", { username: a.username, status: a.status === "active" ? "disabled" : "active" }).then(() => loadAccounts(p)), "Updated.");
    if (adel && confirm(`Delete ${a.name}'s newsroom account?`)) act(null, () => api(`/api/newsroom/accounts?username=${a.username}`, { method: "DELETE" }).then(() => loadAccounts(p)), "Deleted.");
  };
}
async function loadAccounts(p) {
  NR_ACCTS = await api("/api/newsroom/accounts");
  const label = { writer: "Writer", editor: "Editor", coordinator: "Coordinator" };
  $("#nr-acct-list", p).innerHTML = NR_ACCTS.length ? NR_ACCTS.map((a) => `<li><span><strong>${esc(a.name)}</strong> · ${esc(a.username)}<br><small class="date">${label[a.role]}${a.role === "coordinator" ? ": " + esc((a.parts || []).join(", ")) : ""}${a.gradeSection ? " · " + esc(a.gradeSection) : ""}</small></span>
    <span style="display:flex;gap:6px;align-items:center">${a.status === "active" ? "" : pill("disabled", "Disabled")}<button class="small-btn" data-aedit="${a.username}">Edit</button><button class="small-btn" data-atoggle="${a.username}">${a.status === "active" ? "Disable" : "Enable"}</button><button class="small-btn danger" data-adel="${a.username}">Delete</button></span></li>`).join("")
    : `<li class="date">No newsroom accounts yet.</li>`;
}
function wireIssues(p) {
  $("#issue-form", p).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, btn = $("button", f), prog = $("#issue-progress", p), pdf = f.pdf.files[0];
    if (pdf.size > 80 * 1024 * 1024) return flash("PDF must be smaller than 80 MB. Try compressing it first.", false);
    busy(btn, true, "Uploading…");
    try {
      const fd = new FormData();
      ["title", "volume", "date"].forEach((k) => fd.append(k, f[k].value));
      fd.append("size", pdf.size); fd.append("fileName", pdf.name);
      if (f.cover.files[0]) fd.append("cover", await resizeImage(f.cover.files[0], 1000, 0.85));
      const issue = await api("/api/issues", { method: "POST", body: fd });
      for (let n = 0; n < issue.parts; n++) {
        prog.textContent = `Uploading PDF… ${Math.round((n / issue.parts) * 100)}% (keep this page open)`;
        const chunk = pdf.slice(n * issue.partSize, (n + 1) * issue.partSize);
        for (let tries = 0; ; tries++) {
          try { await api(`/api/issues/part?id=${encodeURIComponent(issue.id)}&n=${n}`, { method: "PUT", body: chunk }); break; }
          catch (ex) { if (tries >= 2 || /not a PDF/.test(ex.message)) throw ex; }
        }
      }
      prog.textContent = ""; f.reset(); f.date.value = today();
      flash("Issue uploaded! Readers can now read and download it on the Taga-Silangan page.");
    } catch (ex) { prog.textContent = ""; flash(ex.message, false); }
    busy(btn, false); loadIssues(p);
  };
  $("#issue-list", p).onclick = (e) => { const id = e.target.dataset.idel; if (id && confirm("Delete this issue?")) act(null, () => api(`/api/issues?id=${encodeURIComponent(id)}`, { method: "DELETE" }).then(() => loadIssues(p)), "Deleted."); };
}
async function loadIssues(p) {
  const items = await api("/api/issues?all=1");
  $("#issue-list", p).innerHTML = items.length ? items.map((i) => `<li><span><strong>${esc(i.title)}</strong><br><small class="date">${esc(i.volume || "")} ${fmtDate(i.date)} · ${fmtSize(i.size)}${i.complete ? "" : ` · <span class="status-off">upload incomplete</span>`}</small></span>
    <span style="display:flex;gap:6px;align-items:center;flex:none"><span class="kpi-mini" title="Downloads">⬇ <strong>${i.downloads || 0}</strong> downloads</span>
      ${i.complete ? `<button class="small-btn" onclick="downloadIssue('${i.id}', this, 'open')">Open</button>` : ""}<button class="small-btn danger" data-idel="${i.id}">Delete</button></span></li>`).join("")
    : `<li class="date">No issues uploaded yet.</li>`;
}
async function loadStories(p) {
  const items = await api("/api/posts?type=news");
  $("#news-list", p).innerHTML = items.length ? items.map((x) => postRow(x)).join("") : `<li class="date">No stories yet.</li>`;
}

/* ---------------- Site Settings ---------------- */
const PAPER_DESIGN = [["paperName", "Newspaper name"], ["paperTagline", "Tagline"], ["img:paperLogo", "Taga-Silangan logo"], ["img:paperBg", "Banner background photo (behind the name)"], ["paperFacebook", "Taga-Silangan Facebook page link (e.g. https://www.facebook.com/TagaSilangan)"]];
const SETTINGS_FORM = [
  ["School identity", [["schoolName", "School name"], ["schoolShort", "Seal letters (if no logo, up to 3)"], ["division", "Division / subtitle"], ["schoolId", "DepEd School ID"], ["address", "Address"], ["email", "Email"], ["headName", "School head's name (printed on IDs)"], ["img:logo", "School logo"]]],
  ["Colors", [["color:colorPrimary", "Main color"], ["color:colorAccent", "Accent color"]]],
  ["Home page", [["heroEyebrow", "Small text above the headline"], ["heroTitle", "Headline (*stars* highlight words)"], ["area:heroText", "Welcome message"], ["img:heroImage", "Background photo"], ["statLearners", "Learners enrolled"], ["statTeachers", "Teachers & staff"], ["statGrades", "Grade levels"]]],
  ["About page", [["historyTitle", "History heading"], ["area:history", "School history"], ["img:schoolPhoto", "School photo"], ["area:vision", "Vision"], ["area:mission", "Mission"], ["area:milestones", "Milestones, one per line: Year | What happened"], ["headTitle", "School head's title"], ["area:headMessage", "Message from the school head"], ["img:headPhoto", "School head's photo"]]],
  ["SELG page", [["area:selgAbout", "About the SELG"], ["selgYear", "School year shown"]]],
  ["Taga-Silangan", PAPER_DESIGN],
  ["Contact", [["phone", "Phone"], ["officeHours", "Office hours"], ["facebook", "Facebook page link"], ["mapQuery", "Map location"]]],
  ["e-School ID", [["idTitle", "Card title"], ["area:idAddress", "Address on the ID (2 lines)"], ["idHeadTitle", "Principal's title on the ID (e.g. School Principal-III)"], ["area:idRules", "Rules on the back, one per line"], ["img:idBg", "Background photo of the school building (bottom of the front)"]]],
  ["Report card (SF9) header", [["sf9Region", "Region line (e.g. MIMAROPA REGION)"], ["sf9District", "District line (e.g. District of Romblon)"], ["sf9Town", "Town line (e.g. Romblon, Romblon)"]]],
  ["Privacy Notice", [["dpoName", "Data Protection Officer (name or title)"], ["privacyUpdated", "Privacy Notice last updated"]]],
];
registerTab({
  id: "settings", label: "🎨 Site Settings", show: () => isAdmin(),
  render: (p) => { p.innerHTML = `<p class="notice" style="margin-bottom:18px">Change the website's design and text here. To change page layouts, edit the files on GitHub (see the guide).</p><form id="settings-form" class="form"></form>`; loadSettings(p); },
});
function settingsField(st, [spec, label]) {
  const [kind, key] = spec.includes(":") ? spec.split(":") : ["text", spec];
  if (kind === "img") { const k = st[key + "Key"]; return `<div class="img-setting"><div class="prev" id="prev-${key}">${k ? `<img src="${mediaUrl(k)}" alt="">` : "None"}</div><div><label>${label}</label><input type="file" name="${key}" accept="image/*" data-prev="prev-${key}">${k ? `<label class="checkbox" style="font-weight:400;margin:0"><input type="checkbox" name="remove_${key}"> Remove</label>` : ""}</div></div>`; }
  if (kind === "color") return `<label>${label}</label><div class="color-row"><input type="color" value="${esc(st[key])}" data-sync="${key}"><input type="text" name="${key}" value="${esc(st[key])}" maxlength="7"></div>`;
  if (kind === "area") return `<label>${label}</label><textarea name="${key}" rows="4">${esc(st[key])}</textarea>`;
  return `<label>${label}</label><input name="${key}" value="${esc(st[key])}">`;
}
const BIG_IMAGES = ["heroImage", "idBg", "paperBg"];
async function shrinkSettingImages(f, fd) {
  for (const inp of $$("input[type=file][data-prev]", f)) {
    const name = inp.name, file = inp.files[0];
    fd.delete(name);
    if (file) fd.append(name, await resizeImage(file, BIG_IMAGES.includes(name) ? 2000 : 1000, 0.85));
  }
}
function wirePreviews(f) {
  $$("input[type=file][data-prev]", f).forEach((inp) => (inp.onchange = () => { const file = inp.files[0]; if (file) $("#" + inp.dataset.prev, f).innerHTML = `<img src="${URL.createObjectURL(file)}" alt="">`; }));
}

/* Taga-Silangan adviser: the paper's own logo, banner and Facebook page */
async function loadPaperDesign(p) {
  const box = $("#paper-design", p);
  const st = await fetch("/api/settings").then((r) => r.json());
  box.innerHTML = `<div class="card" style="max-width:760px"><h3>Taga-Silangan page design</h3>
    <p class="hint" style="margin:0 0 14px">These appear on the <a href="newspaper.html" target="_blank">Taga-Silangan page</a>. The Facebook page must be a public <strong>Page</strong> (not a personal profile or a group); its latest posts show on the website automatically.</p>
    <form class="form" id="paper-design-form">${PAPER_DESIGN.map((x) => settingsField(st, x)).join("")}
      <div class="btn-row"><button class="btn navy" type="submit">Save</button><a class="small-btn" href="newspaper.html" target="_blank">Open Taga-Silangan page</a></div></form></div>`;
  const f = $("#paper-design-form", box);
  wirePreviews(f);
  f.onsubmit = (e) => { e.preventDefault(); act($("button[type=submit]", f), async () => {
    const fd = new FormData(f);
    await shrinkSettingImages(f, fd);
    await api("/api/settings", { method: "POST", body: fd }); await loadPaperDesign(p);
  }, "Saved! The Taga-Silangan page now shows your changes."); };
}

async function loadSettings(p) {
  const st = await fetch("/api/settings").then((r) => r.json());
  const field = (x) => settingsField(st, x);
  const f = $("#settings-form", p);
  f.innerHTML = SETTINGS_FORM.map(([t, fs]) => `<div class="card settings-group"><h3>${t}</h3>${fs.map(field).join("")}</div>`).join("") +
    `<div class="save-bar"><button class="btn navy" type="submit">Save changes</button><a class="small-btn" href="index.html" target="_blank">Open website</a><span class="hint" style="margin:0">Changes go live as soon as you save.</span></div>`;
  $$("input[type=color]", f).forEach((c) => { const t = f[c.dataset.sync]; c.oninput = () => (t.value = c.value); t.oninput = () => /^#[0-9a-f]{6}$/i.test(t.value) && (c.value = t.value); });
  wirePreviews(f);
  f.onsubmit = (e) => { e.preventDefault(); act($("button[type=submit]", f), async () => {
    const fd = new FormData(f);
    await shrinkSettingImages(f, fd);
    await api("/api/settings", { method: "POST", body: fd }); await loadSettings(p);
  }, "Saved! The website now shows your changes."); };
}

/* ---------------- School Calendar: school activities + edits to DepEd dates ---------------- */
const calTypeOptions = (sel) => Object.entries(CAL_TYPES).map(([k, t]) => `<option value="${k}" ${k === sel ? "selected" : ""}>${t.label}</option>`).join("");
registerTab({
  id: "calendar", label: "📅 School Calendar", show: () => isHead(),
  render: (p) => {
    p.innerHTML = `<div class="grid grid-2" style="align-items:start">
      <div class="card" id="cal-form-card"><h3 id="cal-form-title">Add a school activity</h3>
        <p class="hint" style="margin:0 0 14px" id="cal-form-hint">Add your school's own activities (e.g. foundation day, intramurals, town fiesta). They appear on the <a href="announcements.html#calendar" target="_blank">School Calendar</a> right away.</p>
        <form id="cal-form" class="form"><input type="hidden" name="id"><input type="hidden" name="deped">
          <label>Activity</label><input name="title" required maxlength="160" placeholder="e.g. School Intramurals">
          <div class="row2"><div><label>Date (start)</label><input name="start" type="date" required></div><div><label>End date (if more than one day)</label><input name="end" type="date"></div></div>
          <label>Kind (sets the color)</label><select name="type">${calTypeOptions("school")}</select>
          <label>Details (optional)</label><input name="note" maxlength="400" placeholder="e.g. Venue, who joins, what to bring">
          <div class="btn-row"><button class="btn navy" type="submit">Save</button><button class="small-btn" type="button" id="cal-reset">Clear</button></div>
        </form></div>
      <div class="card"><h3>School activities</h3><ul class="admin-list" id="cal-list"></ul></div></div>
      <div class="card" style="margin-top:20px"><h3>DepEd calendar dates (SY 2026–2027)</h3>
        <p class="hint" style="margin:0 0 12px">From DepEd Order No. 009, s. 2026. <strong>Edit</strong> to change a date or name (e.g. if DepEd or the Division moves it), <strong>Hide</strong> to remove it from the calendar, <strong>Restore</strong> to go back to the original.</p>
        <div class="inline-form" style="margin-bottom:10px"><select id="cal-month" style="padding:8px;border-radius:8px;border:1px solid #cfc8b8;font:inherit"><option value="">All months</option>${Array.from({ length: 13 }, (_, i) => { const d = new Date(2026, 4 + i, 1); return `<option value="${ymd(d).slice(0, 7)}">${CAL_MONTHS[d.getMonth()]} ${d.getFullYear()}</option>`; }).join("")}</select></div>
        <ul class="admin-list" id="cal-deped"></ul></div>`;
    const f = $("#cal-form", p);
    const reset = () => {
      f.reset(); f.id.value = ""; f.deped.value = ""; f.type.value = "school";
      $("#cal-form-title", p).textContent = "Add a school activity";
    };
    $("#cal-reset", p).onclick = reset;
    f.onsubmit = (e) => { e.preventDefault(); act($("button[type=submit]", f), async () => {
      await postJSON("/api/calendar", { id: f.id.value, deped: f.deped.value, title: f.title.value, start: f.start.value, end: f.end.value, type: f.type.value, note: f.note.value });
      reset(); loadCalList(p);
    }, "Saved to the School Calendar."); };
    const fill = (x, deped) => {
      ["title", "start", "note"].forEach((k) => (f[k].value = x[k] || ""));
      f.end.value = x.end || ""; f.type.value = x.type; f.id.value = deped ? "" : x.id; f.deped.value = deped ? x.id : "";
      $("#cal-form-title", p).textContent = deped ? `Edit DepEd date: ${x.title}` : "Edit school activity";
      $("#cal-form-card", p).scrollIntoView({ behavior: "smooth" });
    };
    p.addEventListener("click", (e) => {
      const d = e.target.dataset;
      if (d.cedit) { const x = CAL_SAVED.find((i) => i.id === d.cedit); if (x) fill(x, false); }
      if (d.cdel) { const x = CAL_SAVED.find((i) => i.id === d.cdel); if (x && confirm(`Delete "${x.title}" from the calendar?`)) act(e.target, () => api(`/api/calendar?id=${encodeURIComponent(x.id)}`, { method: "DELETE" }).then(() => loadCalList(p)), "Deleted."); }
      const dep = (d.dedit || d.dhide || d.drestore) && calMerged().deped.find((x) => x.id === (d.dedit || d.dhide || d.drestore));
      if (d.dedit && dep) fill(dep, true);
      if (d.dhide && dep && confirm(`Hide "${dep.title}" from the School Calendar?`)) act(e.target, () => postJSON("/api/calendar", { deped: dep.id, hidden: true, title: dep.title }).then(() => loadCalList(p)), "Hidden from the calendar.");
      if (d.drestore && dep) act(e.target, () => api(`/api/calendar?id=${encodeURIComponent("ovr-" + dep.id)}`, { method: "DELETE" }).then(() => loadCalList(p)), "Restored to the DepEd date.");
    });
    $("#cal-month", p).onchange = () => drawDeped(p);
    loadCalList(p);
  },
});
let CAL_SAVED = [];
// DepEd dates with any saved edits applied (hidden ones kept here so they can be restored)
function calMerged() {
  const over = Object.fromEntries(CAL_SAVED.filter((x) => x.deped).map((x) => [x.deped, x]));
  return {
    deped: DEPED_CALENDAR.map((e) => {
      const o = over[e.id];
      if (!o) return { ...e };
      if (o.hidden) return { ...e, hidden: true };
      return { ...e, title: o.title || e.title, start: o.start || e.start, end: o.end ?? e.end, type: o.type || e.type, note: o.note || "", edited: true, original: e };
    }),
    school: CAL_SAVED.filter((x) => !x.deped),
  };
}
async function loadCalList(p) {
  CAL_SAVED = await api("/api/calendar");
  const { school } = calMerged();
  $("#cal-list", p).innerHTML = school.length ? school.map((x) => `<li><span><i class="cal-dot" style="background:${(CAL_TYPES[x.type] || CAL_TYPES.school).color}"></i><strong>${esc(x.title)}</strong><br><small class="date">${calRange(x)}${x.note ? " · " + esc(x.note) : ""}</small></span>
      <span style="display:flex;gap:6px"><button class="small-btn" data-cedit="${esc(x.id)}">Edit</button><button class="small-btn danger" data-cdel="${esc(x.id)}">Delete</button></span></li>`).join("")
    : `<li class="date">No school activities yet.</li>`;
  drawDeped(p);
}
function drawDeped(p) {
  const m = $("#cal-month", p).value;
  const rows = calMerged().deped.filter((x) => !m || (x.start.slice(0, 7) <= m && (x.end || x.start).slice(0, 7) >= m)).sort((a, b) => a.start.localeCompare(b.start));
  $("#cal-deped", p).innerHTML = rows.map((x) => `<li${x.hidden ? ' style="opacity:.55"' : ""}><span><i class="cal-dot" style="background:${CAL_TYPES[x.type].color}"></i><strong>${esc(x.title)}</strong>
      ${x.hidden ? ` <span class="status-pill st-rejected">Hidden</span>` : x.edited ? ` <span class="status-pill st-pending">Edited</span>` : ""}
      <br><small class="date">${calRange(x)}${x.edited ? ` · DepEd original: ${esc(x.original.title)}, ${calRange(x.original)}` : ""}${x.note ? " · " + esc(x.note) : ""}</small></span>
      <span style="display:flex;gap:6px">${x.hidden ? "" : `<button class="small-btn" data-dedit="${esc(x.id)}">Edit</button><button class="small-btn" data-dhide="${esc(x.id)}">Hide</button>`}
        ${x.hidden || x.edited ? `<button class="small-btn" data-drestore="${esc(x.id)}">Restore</button>` : ""}</span></li>`).join("") || `<li class="date">No DepEd dates this month.</li>`;
}
