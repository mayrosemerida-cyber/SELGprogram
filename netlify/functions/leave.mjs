// Leave applications and service credits.
// Teachers file leave → the Principal approves or disapproves.
// Approved leave charged to service credits is deducted automatically; any excess is marked "without pay".
import { json, getStaff, hasRole, newId, clean, saveFiles, IMAGE_TYPES, logActivity, staffLabel, SUPER } from "../lib/auth.mjs";
import { store, listJSON, getFile } from "../lib/store.mjs";
import { notifyUsers, usersWithRole } from "../lib/push.mjs";

export const LEAVE_TYPES = [
  "Sick Leave", "Vacation Leave", "Mandatory / Forced Leave", "Special Privilege Leave", "Maternity Leave",
  "Paternity Leave", "Solo Parent Leave", "Study Leave", "10-Day VAWC Leave", "Rehabilitation Privilege",
  "Special Leave Benefits for Women", "Special Emergency (Calamity) Leave", "Adoption Leave", "Others",
];
const round = (n) => Math.round(n * 1000) / 1000;

export async function ledger(username) {
  const [earned, leaves] = await Promise.all([listJSON("credits", username + "--"), listJSON("leave", "")]);
  const used = leaves.filter((l) => l.username === username && l.status === "approved" && l.daysCharged > 0);
  const totalEarned = round(earned.reduce((a, c) => a + Number(c.days || 0), 0));
  const totalUsed = round(used.reduce((a, l) => a + Number(l.daysCharged || 0), 0));
  return {
    username, totalEarned, totalUsed, balance: round(totalEarned - totalUsed),
    earned: earned.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    used: used.map(({ id, type, dateFrom, dateTo, daysCharged, decidedAt }) => ({ id, type, dateFrom, dateTo, daysCharged, decidedAt })),
  };
}

export default async (req) => {
  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);
  const url = new URL(req.url);
  const parts = url.pathname.split("/");
  const action = parts.pop(); // leave | decide | file | credits | summary
  // Approving leave: the Principal only. Service credits & plantilla: the AO / ADAS (and the Principal).
  const isPrincipal = hasRole(me, "principal"), isRecords = hasRole(me, "records");
  const isAdmin = isPrincipal || isRecords; // may see everyone's leave records and service credits
  const leave = store("leave"), credits = store("credits");

  /* ----- Leave ----- */
  if (action === "file") {
    const l = await leave.get(url.searchParams.get("id") || "", { type: "json" });
    if (!l || !l.attachment || (!isAdmin && l.username !== me.username)) return new Response("Not found", { status: 404 });
    const f = await getFile("private", l.attachment.key);
    return f ? new Response(f.data, { headers: { "Content-Type": f.contentType, "Cache-Control": "private, no-store" } }) : new Response("Not found", { status: 404 });
  }

  if (action === "leave" && req.method === "GET") {
    if (url.searchParams.get("types")) return json(LEAVE_TYPES);
    const all = (await listJSON("leave", "")).sort((a, b) => b.createdAt - a.createdAt);
    return json(url.searchParams.get("all") && isAdmin ? all : all.filter((l) => l.username === me.username));
  }

  if (action === "leave" && req.method === "POST") {
    if (me.username === SUPER) return json({ error: "The built-in admin account can't file leave." }, 400);
    const form = await req.formData();
    const type = LEAVE_TYPES.includes(form.get("type")) ? form.get("type") : null;
    const dateFrom = clean(form.get("dateFrom")), dateTo = clean(form.get("dateTo")) || dateFrom;
    const days = Number(form.get("days"));
    if (!type || !dateFrom) return json({ error: "Choose the type of leave and the date(s)." }, 400);
    if (!(days > 0 && days <= 365)) return json({ error: "Enter the number of working days applied for." }, 400);
    let files = [];
    try { files = await saveFiles([form.get("attachment")].filter(Boolean), `leave-${me.username}`, { storeName: "private", types: [...IMAGE_TYPES, "application/pdf"], label: "Attachment" }); }
    catch (e) { return json({ error: e.message }, 400); }
    const l = {
      id: `lv-${newId()}`, username: me.username, name: me.name, position: me.position || "",
      type, dateFrom, dateTo, days, reason: clean(form.get("reason"), 2000),
      chargeSC: form.get("chargeSC") === "on", attachment: files[0] || null,
      status: "pending", createdAt: Date.now(),
    };
    await leave.setJSON(l.id, l);
    await logActivity(staffLabel(me), "filed leave application", `${type}, ${days} day(s), ${dateFrom}`, "Leave");
    await notifyUsers((await usersWithRole("principal")).filter((u) => u !== me.username), {
      title: "🗓️ New leave application", body: `${me.name}: ${type}, ${days} day(s) from ${dateFrom}. Tap to review.`, url: "/admin.html#leaveapprove", tag: l.id,
    });
    return json(l, 201);
  }

  if (action === "decide" && req.method === "POST") {
    if (!isPrincipal) return json({ error: "Only the Principal can approve leave." }, 403);
    const b = await req.json().catch(() => ({}));
    const l = b.id && (await leave.get(b.id, { type: "json" }));
    if (!l) return json({ error: "Not found." }, 404);
    if (l.status !== "pending") return json({ error: "This application was already acted on." }, 400);
    if (l.username === me.username) return json({ error: "You can't approve your own leave." }, 403);
    l.decidedBy = me.name; l.decidedAt = Date.now(); l.remarks = clean(b.remarks, 1000);
    if (b.action === "approve") {
      l.status = "approved";
      if (typeof b.chargeSC === "boolean") l.chargeSC = b.chargeSC;
      if (l.chargeSC) {
        const { balance } = await ledger(l.username);
        l.daysCharged = round(Math.min(l.days, Math.max(balance, 0)));
        l.daysWithoutPay = round(l.days - l.daysCharged);
      } else { l.daysCharged = 0; l.daysWithoutPay = 0; }
    } else l.status = "disapproved";
    await leave.setJSON(l.id, l);
    await notifyUsers([l.username], { title: l.status === "approved" ? "✅ Your leave was approved" : "Your leave was not approved", body: `${l.type}, ${l.days} day(s) from ${l.dateFrom}${l.remarks ? ". Note: " + l.remarks : ""}`, url: "/admin.html#leave", tag: l.id });
    if (l.status === "approved") await notifyUsers((await usersWithRole("records")).filter((u) => u !== l.username), { title: "Leave approved: update records", body: `${l.name}: ${l.type}, ${l.days} day(s)${l.daysCharged ? `, ${l.daysCharged} charged to service credits` : ""}.`, url: "/admin.html#credits", tag: l.id + "-r" });
    await logActivity(staffLabel(me), `${l.status} leave`, `${l.name}: ${l.type}, ${l.days} day(s)${l.daysCharged ? `, ${l.daysCharged} charged to service credits` : ""}`, "Leave");
    return json({ ...l, ledger: await ledger(l.username) });
  }

  if (action === "leave" && req.method === "DELETE") {
    const l = await leave.get(url.searchParams.get("id") || "", { type: "json" });
    if (!l) return json({ error: "Not found." }, 404);
    if (!isPrincipal && !(l.username === me.username && l.status === "pending")) return json({ error: "You can only cancel your own pending application." }, 403);
    if (l.attachment) await store("private").delete(l.attachment.key);
    await leave.delete(l.id);
    await logActivity(staffLabel(me), "cancelled leave application", `${l.name}: ${l.type}`, "Leave");
    return json({ ok: true });
  }

  /* ----- Service credits ----- */
  if (action === "summary") {
    if (!isAdmin) return json({ error: "Only the Principal and the AO / ADAS can see this." }, 403);
    const staff = (await listJSON("staff", "")).filter((s) => s.status === "active");
    const rows = await Promise.all(staff.map(async (s) => {
      const L = await ledger(s.username);
      return { username: s.username, name: s.name, position: s.position || "", plantilla: s.plantilla || {}, totalEarned: L.totalEarned, totalUsed: L.totalUsed, balance: L.balance };
    }));
    return json(rows.sort((a, b) => a.name.localeCompare(b.name)));
  }

  if (action === "credits" && req.method === "GET") {
    const username = isAdmin && url.searchParams.get("username") ? url.searchParams.get("username") : me.username;
    if (url.searchParams.get("file")) {
      const c = await credits.get(url.searchParams.get("file"), { type: "json" });
      if (!c || !c.file || (!isAdmin && c.username !== me.username)) return new Response("Not found", { status: 404 });
      const f = await getFile("private", c.file.key);
      return f ? new Response(f.data, { headers: { "Content-Type": f.contentType, "Cache-Control": "private, no-store" } }) : new Response("Not found", { status: 404 });
    }
    return json(await ledger(username));
  }

  if (!isRecords) return json({ error: "Only the AO / ADAS or the Principal can update service credits." }, 403);

  const addCredit = async (row, file) => {
    const username = clean(row.username).toLowerCase();
    const s = await store("staff").get(username, { type: "json" });
    const days = Number(row.days);
    if (!s) throw new Error(`No staff account "${row.username}".`);
    if (!(days > 0 && days <= 100)) throw new Error(`Days must be a number (${row.username}).`);
    const id = `${username}--${newId()}`;
    const c = { id, username, name: s.name, days: round(days), reason: clean(row.reason, 300), reference: clean(row.reference, 200), date: clean(row.date) || new Date().toISOString().slice(0, 10), file: file || null, by: me.name, createdAt: Date.now() };
    await credits.setJSON(id, c);
    return c;
  };

  if (action === "credits" && req.method === "POST") {
    const form = await req.formData();
    try {
      const files = await saveFiles([form.get("file")].filter(Boolean), "sc", { storeName: "private", types: [...IMAGE_TYPES, "application/pdf"], label: "Proof" });
      const c = await addCredit(Object.fromEntries(form), files[0]);
      await logActivity(staffLabel(me), "added service credits", `${c.name}: ${c.days} day(s), ${c.reason}`, "Service Credits");
      return json(c, 201);
    } catch (e) { return json({ error: e.message }, 400); }
  }

  if (action === "credits" && req.method === "PUT") {
    const rows = await req.json().catch(() => null);
    if (!Array.isArray(rows)) return json({ error: "Expected a list." }, 400);
    let added = 0; const errors = [];
    for (const r of rows.slice(0, 2000)) {
      try { await addCredit(r); added++; } catch (e) { errors.push(e.message); }
    }
    await logActivity(staffLabel(me), "uploaded service credits", `${added} entries`, "Service Credits");
    return json({ added, errors });
  }

  if (action === "credits" && req.method === "DELETE") {
    const c = await credits.get(url.searchParams.get("id") || "", { type: "json" });
    if (!c) return json({ error: "Not found." }, 404);
    if (c.file) await store("private").delete(c.file.key);
    await credits.delete(c.id);
    await logActivity(staffLabel(me), "removed service credit entry", `${c.name}: ${c.days} day(s)`, "Service Credits");
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
};

export const config = {
  path: ["/api/leave", "/api/leave/decide", "/api/leave/file", "/api/credits", "/api/credits/summary"],
};
