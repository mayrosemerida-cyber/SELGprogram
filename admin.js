// ===== Staff Dashboard: core =====
// Each feature file registers its tabs with registerTab(); startDashboard() builds the ones this person may see.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let ME = null, NOTES = {};
// Same rule as the server: the Principal and the Website Administrator can each help with everything except the other's own duties
const can = (...roles) => !!ME && (roles.some((r) => ME.roles.includes(r)) || (ME.roles.includes("admin") && !roles.includes("principal") && !roles.includes("records")) || (ME.roles.includes("principal") && !roles.includes("admin")));
const isAdmin = () => !!ME && ME.roles.includes("admin");          // Website Administrator
const isPrincipal = () => !!ME && ME.roles.includes("principal");  // Principal
const isRecords = () => can("records");                        // AO / ADAS (the Principal too)
const isHead = () => isAdmin() || isPrincipal();                    // either one: oversees every class, staff and sections
const isAdviser = () => !!ME && (isHead() || ME.sections.length > 0);
const today = () => new Date().toISOString().slice(0, 10);
const BTN = "";

function flash(msg, ok = true) {
  const el = $("#flash");
  el.innerHTML = `<div class="${ok ? "ok-msg" : "error-msg"}">${esc(msg)}</div>`;
  clearTimeout(flash.t);
  flash.t = setTimeout(() => (el.innerHTML = ""), 7000);
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
async function api(url, opts = {}) {
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(); throw new Error(data.error || "Please sign in again."); }
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
const postJSON = (url, body, method = "POST") => api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || "Saving…"; btn.disabled = true; }
  else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
}
// Run an async action from a form submit, with button state + flash
async function act(btn, fn, okMsg, label) {
  busy(btn, true, label);
  try { const r = await fn(); if (okMsg) flash(typeof okMsg === "function" ? okMsg(r) : okMsg); return r; }
  catch (ex) { flash(ex.message, false); }
  finally { busy(btn, false); }
}
const pill = (st, txt) => `<span class="status-pill st-${st}">${esc(txt || st)}</span>`;
const fmtDT = (t) => new Date(t).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

/* ----- Spreadsheets (CSV or Excel) ----- */
async function readSheet(file) {
  if (!window.XLSX) await new Promise((r) => { const t = setInterval(() => window.XLSX && (clearInterval(t), r()), 100); });
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
}
const csvCell = (v) => /[",\n]/.test(String(v ?? "")) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? "");
function downloadCSV(rows, filename) {
  const text = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv" }));
  a.download = filename; document.body.appendChild(a); a.click(); a.remove();
}
// Turn header row + rows into objects with normalized keys
function rowsToObjects(rows) {
  const head = rows[0].map((h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
  return rows.slice(1).filter((r) => r.some((c) => String(c).trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, String(r[i] ?? "").trim()])));
}

/* ----- Tabs ----- */
const TABS = [];
function registerTab(t) { TABS.push(t); }
function openTab(id) {
  const t = TABS.find((x) => x.id === id);
  if (!t) return;
  $$("#tabs button").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  $$("#panels > .panel").forEach((p) => p.classList.toggle("active", p.dataset.panel === id));
  const panel = $(`#panels > .panel[data-panel="${id}"]`);
  if (!panel.dataset.ready) { panel.dataset.ready = "1"; t.render(panel); }
  else if (t.refresh) t.refresh(panel);
  try { sessionStorage.setItem("recsTab", id); } catch {}
}
$("#tabs").addEventListener("click", (e) => { const t = e.target.closest("button")?.dataset.tab; if (t) openTab(t); });
document.addEventListener("click", (e) => { const g = e.target.closest("[data-goto]")?.dataset.goto; if (g) { e.preventDefault(); openTab(g); } });

// Sub-tabs inside a panel: <div class="subtabs"><button data-sub="x">…</button></div> + <div class="subpanel" data-subpanel="x">
function wireSubtabs(panel, onOpen) {
  $(".subtabs", panel)?.addEventListener("click", (e) => {
    const sub = e.target.closest("button")?.dataset.sub;
    if (!sub) return;
    $$(".subtabs button", panel).forEach((b) => b.classList.toggle("active", b.dataset.sub === sub));
    $$(".subpanel", panel).forEach((p) => p.classList.toggle("active", p.dataset.subpanel === sub));
    onOpen?.(sub);
  });
}

async function refreshBadges() {
  try { NOTES = await api("/api/notifications"); } catch { return; }
  const map = { approvals: NOTES.approvals + NOTES.staff, class: NOTES.excuses, leaveapprove: NOTES.leave, paper: NOTES.paper };
  for (const [tab, n] of Object.entries(map)) {
    const b = $(`#tabs button[data-tab="${tab}"] .badge`);
    if (b) { b.textContent = n; b.hidden = !n; }
  }
}

/* ----- Sign in / request account ----- */
function showLogin() { $("#admin-login").hidden = false; $("#admin-app").hidden = true; }
$("#admin-login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#admin-login-error"); err.hidden = true;
  try {
    const r = await postJSON("/api/staff/login", { username: e.target.username.value, password: e.target.password.value });
    e.target.reset();
    if (r.needCode) {
      // Password was right; ask for the 6-digit code from the authenticator app
      $("#admin-login-form").hidden = true; $("#signin-links").hidden = true; $("#code-form").hidden = false;
      $("#code2").focus();
      return;
    }
    startDashboard();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
$("#code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#admin-login-error"); err.hidden = true;
  try {
    const r = await postJSON("/api/staff/verify", { code: e.target.code.value });
    e.target.reset(); resetSignin();
    if (r.recoveryLeft !== undefined && r.recoveryLeft <= 2) sessionStorage.setItem("recsLowCodes", r.recoveryLeft);
    startDashboard();
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    if (/expired/i.test(ex.message)) resetSignin();
  }
});
function resetSignin() { $("#admin-login-form").hidden = false; $("#signin-links").hidden = false; $("#code-form").hidden = true; }
$("#code-back").addEventListener("click", (e) => { e.preventDefault(); resetSignin(); });
$("#show-register").addEventListener("click", (e) => { e.preventDefault(); $("#signin-card").hidden = true; $("#register-card").hidden = false; });
$("#show-signin").addEventListener("click", (e) => { e.preventDefault(); $("#signin-card").hidden = false; $("#register-card").hidden = true; });
$("#register-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, msg = $("#register-msg");
  try {
    await postJSON("/api/staff/register", Object.fromEntries(new FormData(f)));
    msg.innerHTML = `<div class="ok-msg">Request sent! You can sign in once the Principal approves your account.</div>`;
    f.reset();
  } catch (ex) { msg.innerHTML = `<div class="error-msg">${esc(ex.message)}</div>`; }
});

/* ----- Overview ----- */
registerTab({
  id: "overview", label: "🏠 Overview", show: () => true,
  render: (p) => renderOverview(p), refresh: (p) => renderOverview(p),
});
async function renderOverview(p) {
  await refreshBadges();
  const n = NOTES;
  const k = (num, label, tab, show = true) => show ? `<div class="kpi"><strong>${num}</strong><span>${label}</span><br><a href="#" data-goto="${tab}">Open →</a></div>` : "";
  const low = (() => { try { return sessionStorage.getItem("recsLowCodes"); } catch { return null; } })();
  p.innerHTML = `${ME.weakAdminPassword ? `<div class="warn-banner">⚠️ <strong>The admin password is weak.</strong> In Netlify, change <code>ADMIN_PASSWORD</code> to at least 10 characters with letters and numbers, then redeploy.</div>` : ""}
    ${ME.twoStep?.recommended ? `<div class="warn-banner">🔐 <strong>Protect this account with two-step sign-in.</strong> It has access to all learner and staff records. It takes 2 minutes with a free phone app. <a href="#" data-goto="account">Set it up now →</a></div>` : ""}
    ${low !== null ? `<div class="warn-banner">⚠️ You have only <strong>${esc(low)}</strong> two-step recovery code(s) left. Make new ones in <a href="#" data-goto="account">My account</a>.</div>` : ""}
    <div class="kpis">
      ${k(n.approvals + n.staff, "items waiting for your approval", "approvals", isHead() || can("selg"))}
      ${k(n.excuses, "excuse letters to review", "class", isAdviser())}
      ${k(n.leave, "leave applications to act on", "leaveapprove", isPrincipal())}
      ${k(n.paper, "write-ups ready to publish", "paper", can("paper"))}
    </div>
    ${n.myLeave?.length ? `<div class="card" style="margin-bottom:20px"><h3>Updates on your leave</h3><ul class="admin-list">${n.myLeave.map((l) => `<li><span>${esc(l.type)} · ${fmtDate(l.dateFrom)}</span>${pill(l.status)}</li>`).join("")}</ul></div>` : ""}
    <div class="card"><h3>Your sections</h3>${ME.sections.length ? `<ul class="admin-list">${ME.sections.map((s) => `<li><span>${esc(s.grade)} – ${esc(s.name)}</span><a class="small-btn" href="#" data-goto="class">Open class</a></li>`).join("")}</ul>` : `<p class="date">${isHead() ? "You can open every section under My Class." : `You don't have a class yet. <a href="#" data-goto="class">Upload your School Form 1</a> under My Class to set it up.`}</p>`}</div>`;
  pushReminder(p);
}

/* ----- My account ----- */
registerTab({
  id: "account", label: "👤 My account", show: () => true,
  render: (p) => {
    p.innerHTML = `<div class="grid grid-2" style="align-items:start">
      <div class="card">
        <h3>Change my password</h3>
        ${ME.username === "admin" ? `<p class="hint">You're using the built-in <strong>admin</strong> account. Its password is the ADMIN_PASSWORD setting in Netlify.</p>` : `
        <form id="pw-form" class="form">
          <label>Current password</label><input name="current" type="password" autocomplete="current-password" required>
          <label>New password</label><input name="next" type="password" autocomplete="new-password" minlength="10" required>
          <p class="hint">At least 10 characters, with both letters and numbers. Don't use your name, username or common words.</p>
          <button class="btn navy" type="submit">Change password</button>
        </form>`}
      </div>
      <div class="card"><h3>My plantilla information</h3><div id="my-plantilla"><p class="loading">Loading…</p></div></div>
    </div>
    <div class="card secure-box" style="margin-top:20px" id="push-box"></div>
    <div class="card secure-box" style="margin-top:20px" id="twostep-box"></div>`;
    renderPush($("#push-box", p));
    renderTwoStep($("#twostep-box", p));
    $("#pw-form", p)?.addEventListener("submit", (e) => { e.preventDefault(); act($("button", e.target), () => postJSON("/api/staff/password", { current: e.target.current.value, next: e.target.next.value }).then(() => e.target.reset()), "Password changed."); });
    api("/api/admin/staff?me=1").then((rec) => {
      const pl = rec.plantilla || {};
      $("#my-plantilla", p).innerHTML = Object.keys(pl).length ? PLANTILLA_FIELDS.map(([k, l]) => `<div class="profile-row"><span>${l}</span><strong>${esc(pl[k] || "—")}</strong></div>`).join("")
        : `<p class="date">No plantilla information yet. The AO / ADAS adds it under Service Credits &amp; Plantilla.</p>`;
    }).catch(() => ($("#my-plantilla", p).innerHTML = `<p class="date">Not available.</p>`));
  },
});
/* ----- Two-step sign-in (authenticator app) ----- */
function recoveryHTML(codes) {
  return `<div class="ok-msg" style="margin-top:14px"><strong>Save these recovery codes now.</strong> Each can be used once if you lose your phone. They won't be shown again.</div>
    <div class="recovery-codes">${codes.map((c) => `<span>${c}</span>`).join("")}</div>
    <div class="btn-row"><button class="small-btn" type="button" id="rc-copy">📋 Copy</button><button class="small-btn" type="button" id="rc-dl">⬇ Download as text file</button><button class="small-btn" type="button" id="rc-print">🖨 Print</button></div>`;
}
function wireRecovery(box, codes) {
  const text = `RECS Website, two-step recovery codes for ${ME.username}\n(each code works once)\n\n${codes.join("\n")}\n`;
  $("#rc-copy", box).onclick = () => navigator.clipboard?.writeText(text).then(() => flash("Copied. Paste them somewhere safe."));
  $("#rc-dl", box).onclick = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" })); a.download = "recs-recovery-codes.txt"; a.click(); };
  $("#rc-print", box).onclick = () => { const w = window.open("", "_blank"); w.document.write(`<pre style="font-size:18px">${esc(text)}</pre>`); w.print(); };
}
async function renderTwoStep(box) {
  const me = await api("/api/staff/check");
  ME.twoStep = me.twoStep;
  if (me.twoStep.enabled) {
    box.innerHTML = `<h3>🔐 Two-step sign-in: <span class="status-pill st-active">On</span></h3>
      <p>When you sign in, you'll enter a 6-digit code from your authenticator app after your password. Recovery codes left: <strong>${me.twoStep.recoveryLeft}</strong>.</p>
      <form class="inline-form" id="ts-manage"><input name="code" inputmode="numeric" placeholder="Code from your app" maxlength="9" style="max-width:200px;padding:10px;border:1px solid #cfc8b8;border-radius:10px;font:inherit">
        <button class="small-btn" type="button" data-ts="newcodes">Make new recovery codes</button><button class="small-btn danger" type="button" data-ts="disable">Turn off</button></form>
      <div id="ts-out"></div>`;
    $("#ts-manage", box).onclick = async (e) => {
      const a = e.target.dataset.ts; if (!a) return;
      if (a === "disable" && !confirm("Turn off two-step sign-in? Your account will be less protected.")) return;
      const code = $("#ts-manage", box).code.value;
      const r = await act(e.target, () => postJSON("/api/staff/2fa", { action: a, code }), a === "disable" ? "Two-step sign-in is off." : "New recovery codes made. The old ones no longer work.");
      if (!r) return;
      try { sessionStorage.removeItem("recsLowCodes"); } catch {}
      if (a === "disable") renderTwoStep(box);
      else { $("#ts-out", box).innerHTML = recoveryHTML(r.recoveryCodes); wireRecovery(box, r.recoveryCodes); }
    };
    return;
  }
  box.innerHTML = `<h3>🔐 Two-step sign-in: <span class="status-pill st-pending">Off</span></h3>
    <p>Add a second lock to your account. After your password, you'll also type a 6-digit code from a free app on your phone. Even if someone learns your password, they can't sign in without your phone.</p>
    ${isHead() ? `<p class="notice">Strongly recommended for the Principal and Website Administrator accounts, because they can see every learner and staff record.</p>` : ""}
    <button class="btn navy" type="button" id="ts-start">Set up two-step sign-in</button><div id="ts-setup"></div>`;
  $("#ts-start", box).onclick = async (e) => {
    const r = await act(e.target, () => postJSON("/api/staff/2fa", { action: "setup" }));
    if (!r) return;
    let qrSvg = "";
    try { const q = qrcode(0, "M"); q.addData(r.otpauth); q.make(); qrSvg = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch {}
    e.target.hidden = true;
    $("#ts-setup", box).innerHTML = `<ol style="padding-left:20px;margin-top:14px">
        <li style="margin-bottom:10px">On your phone, install <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> (free from Play Store / App Store).</li>
        <li style="margin-bottom:10px">In the app, tap <strong>+</strong> → <strong>Scan a QR code</strong>, and scan this:<br><span class="qr-box" style="margin-top:8px">${qrSvg}</span>
          <br><small class="date">Can't scan? Choose "Enter a setup key" and type: <code style="user-select:all">${r.secret.replace(/(.{4})/g, "$1 ").trim()}</code></small></li>
        <li>Type the 6-digit code the app shows for <strong>RECS Website</strong>:</li></ol>
      <form class="inline-form" id="ts-enable"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" required style="max-width:160px;padding:10px;border:1px solid #cfc8b8;border-radius:10px;font:inherit;font-size:1.2rem;letter-spacing:.2em">
        <button class="btn navy" type="submit">Turn on</button></form><div id="ts-out"></div>`;
    $("#ts-enable", box).onsubmit = async (ev) => {
      ev.preventDefault();
      const res = await act($("button", ev.target), () => postJSON("/api/staff/2fa", { action: "enable", code: ev.target.code.value }), "Two-step sign-in is on!");
      if (!res) return;
      ME.twoStep = { enabled: true, recoveryLeft: 8, recommended: false };
      $("#ts-setup", box).innerHTML = `<h4 style="margin-top:16px">✅ Done! Next time you sign in, you'll also need your phone.</h4>${recoveryHTML(res.recoveryCodes)}
        <button class="small-btn" type="button" id="ts-finish" style="margin-top:14px">I saved my recovery codes</button>`;
      wireRecovery(box, res.recoveryCodes);
      $("#ts-finish", box).onclick = () => renderTwoStep(box);
    };
  };
}
const PLANTILLA_FIELDS = [["itemNo", "Plantilla item no."], ["positionTitle", "Position title"], ["salaryGrade", "Salary grade"], ["step", "Step"], ["employeeNo", "Employee no."], ["dateOriginalAppointment", "Date of original appointment"], ["dateLastPromotion", "Date of last promotion"], ["appointmentStatus", "Appointment status"], ["eligibility", "Eligibility"]];

/* ----- e-School ID preview (used by class tools) ----- */
async function previewId(lrn) {
  try {
    const { learner, school } = await api(`/api/learner/me?lrn=${lrn}`);
    const front = $("#adm-front"), back = $("#adm-back");
    await renderIdCard(front, back, learner, school, `/api/learner/file?what=photo&lrn=${lrn}&v=${learner.photoVersion}`);
    const base = `eSchoolID-${learner.lastName}-${lrn}`.replace(/[^\w-]+/g, "");
    $("#adm-dl-front").onclick = () => downloadCanvas(front, base + "-front.png");
    $("#adm-dl-back").onclick = () => downloadCanvas(back, base + "-back.png");
    $("#id-modal").classList.add("open");
  } catch (ex) { flash(ex.message, false); }
}
$("#id-close").addEventListener("click", () => $("#id-modal").classList.remove("open"));

/* ----- Start ----- */
async function startDashboard() {
  const me = await fetch("/api/staff/check").then((r) => r.json()).catch(() => ({}));
  if (!me.signedIn) return showLogin();
  ME = me;
  $("#admin-login").hidden = true; $("#admin-app").hidden = false;
  $("#who-name").textContent = me.name;
  $("#who-roles").textContent = `(${me.roleLabels.filter((r) => r !== me.name).join(", ") || "admin"}${me.sections.length ? " · Adviser of " + me.sections.map((s) => `${s.grade} ${s.name}`).join(", ") : ""})`;
  const ORDER = ["overview", "approvals", "announcements", "class", "selg", "paper", "leave", "leaveapprove", "credits", "calendar", "org", "sections", "staff", "activity", "settings", "account"];
  const visible = TABS.filter((t) => t.show()).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  $("#tabs").innerHTML = visible.filter((t) => t.id !== "account").map((t) => `<button data-tab="${t.id}">${t.label}<span class="badge" hidden></span></button>`).join("");
  $("#panels").innerHTML = visible.map((t) => `<div class="panel" data-panel="${t.id}"></div>`).join("");
  let first = "overview";
  try { const saved = sessionStorage.getItem("recsTab"); if (visible.some((t) => t.id === saved)) first = saved; } catch {}
  const fromLink = location.hash.slice(1); // a tapped notification opens its tab
  if (visible.some((t) => t.id === fromLink)) first = fromLink;
  openTab(first);
  refreshBadges();
  setInterval(refreshBadges, 60000);
}

/* ----- Phone / computer notifications (Web Push) ----- */
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function deviceName() {
  const ua = navigator.userAgent;
  const os = /android/i.test(ua) ? "Android" : isIOS() ? "iPhone/iPad" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "Mac" : "Computer";
  const br = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Browser";
  return `${os} · ${br}`;
}
async function currentPushSub() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}
const b64ToBytes = (b64) => { const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, (c) => c.charCodeAt(0)); };
async function turnOnPush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const { publicKey } = await api("/api/push/key");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) }));
  await postJSON("/api/push/subscribe", { subscription: sub.toJSON(), device: deviceName() });
}
async function renderPush(box) {
  const what = [
    isPrincipal() && "new leave applications and announcements waiting for approval",
    isRecords() && !isPrincipal() && "approved leave (so you can update the records)",
    isHead() && "new staff account requests",
    isAdviser() && "excuse letters from your learners",
    "the decision on your own leave",
  ].filter(Boolean);
  box.innerHTML = `<h3>📱 Notifications on this phone or computer</h3>
    <p>Get an alert on this device, like a text message, when there's something for you: ${what.join("; ")}. It's free and needs no email or SMS load.</p><div id="push-state"><p class="loading">Checking…</p></div>`;
  const st = $("#push-state", box);
  if (isIOS() && !isStandalone()) {
    st.innerHTML = `<p class="notice"><strong>On iPhone or iPad:</strong> open this website in <strong>Safari</strong>, tap the <strong>Share</strong> button ⬆️ → <strong>Add to Home Screen</strong>. Open the website from the new icon on your home screen, sign in, and come back here to turn on notifications. (Needs iOS 16.4 or newer.)</p>`;
    return;
  }
  if (!pushSupported()) { st.innerHTML = `<p class="notice">This browser can't show notifications. Use Chrome, Edge, Firefox or Safari (latest version).</p>`; return; }
  const sub = await currentPushSub().catch(() => null);
  const devices = await api("/api/push/devices").catch(() => []);
  const list = devices.length ? `<p class="hint" style="margin:10px 0 0">Turned on for: ${devices.map((d) => esc(d.device || "a device")).join(", ")}</p>` : "";
  if (sub && Notification.permission === "granted") {
    st.innerHTML = `<p><span class="status-pill st-approved">On for this device</span></p>
      <div class="btn-row"><button class="small-btn" id="push-test">Send a test notification</button><button class="small-btn danger" id="push-off">Turn off on this device</button></div>${list}`;
    $("#push-test", box).onclick = (e) => act(e.target, () => postJSON("/api/push/test", {}), (r) => r.sent ? "Test sent. It should appear in a few seconds." : "Couldn't send. Turn notifications off and on again.");
    $("#push-off", box).onclick = (e) => act(e.target, async () => { await postJSON("/api/push/unsubscribe", { endpoint: sub.endpoint }); await sub.unsubscribe(); renderPush(box); }, "Notifications turned off for this device.");
  } else {
    st.innerHTML = `${Notification.permission === "denied" ? `<p class="error-msg">Notifications are blocked for this site. Allow them in your browser's site settings (🔒 next to the address), then reload.</p>` : ""}
      <button class="btn navy" id="push-on">Turn on notifications</button>${list}
      <p class="hint" style="margin:10px 0 0">Do this on every phone or computer where you want alerts. On Android, use Chrome.</p>`;
    $("#push-on", box).onclick = (e) => act(e.target, async () => { await turnOnPush(); await renderPush(box); }, "Notifications are on for this device.");
  }
}

// Overview reminder for people who get approvals, until notifications are on for this device
async function pushReminder(p) {
  if (!(isPrincipal() || isRecords() || isHead() || isAdviser())) return;
  try { if (sessionStorage.getItem("recsPushHide")) return; } catch {}
  const on = pushSupported() && Notification.permission === "granted" && (await currentPushSub().catch(() => null));
  if (on) return;
  const div = document.createElement("div");
  div.className = "warn-banner"; div.style.background = "#e7f5ff"; div.style.borderColor = "#74c0fc";
  div.innerHTML = `📱 <strong>Get alerts on your phone</strong>${isPrincipal() ? " when a teacher files leave" : ""}. <a href="#" data-goto="account">Turn on notifications →</a> <a href="#" data-hide-push style="margin-left:10px;font-weight:400">Not now</a>`;
  div.querySelector("[data-hide-push]").onclick = (e) => { e.preventDefault(); div.remove(); try { sessionStorage.setItem("recsPushHide", "1"); } catch {} };
  p.prepend(div);
}
