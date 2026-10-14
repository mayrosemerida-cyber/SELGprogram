// Principal and Website Administrator: approve sign-ups, roles, plantilla items, disable or delete accounts.
// GET /api/admin/staff?brief=1 is available to all staff (names only, for pickers).
import { json, getStaff, hasRole, hashPassword, ROLES, SUPER, clean, logActivity, staffLabel } from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";
import { passwordProblem, get2fa } from "../lib/security.mjs";

const USER_RE = /^[a-z0-9._-]{3,30}$/;
const PLANTILLA = ["itemNo", "positionTitle", "salaryGrade", "step", "employeeNo", "dateOriginalAppointment", "dateLastPromotion", "appointmentStatus", "eligibility"];
const strip = ({ passwordHash, ...rest }) => rest;

export default async (req) => {
  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);
  const url = new URL(req.url);
  const staff = store("staff");

  if (req.method === "GET" && url.searchParams.get("brief")) {
    const all = await listJSON("staff", "");
    return json(all.filter((s) => s.status === "active").map((s) => ({ username: s.username, name: s.name, roles: s.roles }))
      .sort((a, b) => a.name.localeCompare(b.name)));
  }
  // A teacher can read their own record (plantilla)
  if (req.method === "GET" && url.searchParams.get("me")) {
    const rec = me.username === SUPER ? null : await staff.get(me.username, { type: "json" });
    return json(rec ? strip(rec) : {});
  }

  // The AO / ADAS may only update plantilla items
  if (!hasRole(me, "admin", "principal")) {
    if (!hasRole(me, "records")) return json({ error: "Only the Principal and the Website Administrator can manage staff." }, 403);
    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const rec = b.username && (await staff.get(clean(b.username).toLowerCase(), { type: "json" }));
      if (!rec || !b.plantilla || typeof b.plantilla !== "object") return json({ error: "Choose a teacher." }, 400);
      rec.plantilla = Object.fromEntries(PLANTILLA.map((k) => [k, clean(b.plantilla[k], 120)]));
      await staff.setJSON(rec.username, rec);
      await logActivity(staffLabel(me), "updated plantilla item", rec.name, "HR");
      return json(strip(rec));
    }
    if (req.method !== "PUT") return json({ error: "Only the Principal and the Website Administrator can manage staff." }, 403);
  }

  if (req.method === "GET") {
    const all = await listJSON("staff", "");
    const tf = await Promise.all(all.map((s) => get2fa(s.username)));
    all.forEach((s, i) => (s.twoStep = !!tf[i].enabled));
    return json(all.map(strip).sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || a.name.localeCompare(b.name)));
  }

  if (req.method === "POST") {
    const b = await req.json().catch(() => ({}));
    const username = clean(b.username).toLowerCase();
    if (!USER_RE.test(username) || username === SUPER) return json({ error: "Username: 3–30 letters, numbers, dots or dashes (and not 'admin')." }, 400);
    const existing = await staff.get(username, { type: "json" });
    if (b.isNew && existing) return json({ error: "That username is already taken." }, 400);
    const rec = existing || { username, createdAt: Date.now(), version: 0, status: "active" };

    if ("name" in b) rec.name = clean(b.name) || username;
    if ("position" in b) rec.position = clean(b.position);
    if ("roles" in b) {
      const next = (Array.isArray(b.roles) ? b.roles : []).filter((r) => ROLES.includes(r));
      if (!next.length) return json({ error: "Choose at least one role." }, 400);
      const before = rec.roles || [];
      const changed = (r) => before.includes(r) !== next.includes(r);
      if (username === me.username && (changed("principal") || changed("admin"))) return json({ error: "You can't change your own Principal or Administrator role. Ask the other one to do it." }, 403);
      if (changed("admin") && !hasRole(me, "admin")) return json({ error: "Only the Website Administrator can give or remove the Administrator role." }, 403);
      rec.roles = next;
    }
    if (b.plantilla && typeof b.plantilla === "object") {
      if (!hasRole(me, "records")) return json({ error: "Only the AO / ADAS or the Principal can edit plantilla items." }, 403);
      rec.plantilla = Object.fromEntries(PLANTILLA.map((k) => [k, clean(b.plantilla[k], 120)]));
    }
    if (b.status && ["active", "disabled", "pending"].includes(b.status) && b.status !== rec.status) {
      rec.version = (rec.version || 0) + 1; // signs them out
      await logActivity(staffLabel(me), b.status === "active" ? (rec.status === "pending" ? "approved account" : "enabled account") : "disabled account", rec.name, "Staff");
      rec.status = b.status;
    }
    if (b.password) {
      const bad = passwordProblem(b.password, { username, name: rec.name || b.name });
      if (bad) return json({ error: bad }, 400);
      rec.passwordHash = hashPassword(b.password);
      rec.version = (rec.version || 0) + 1;
    }
    if (!rec.passwordHash) return json({ error: "Set a password for the new account." }, 400);
    if (!rec.roles?.length) rec.roles = ["teacher"];
    await staff.setJSON(username, rec);
    if (!existing) await logActivity(staffLabel(me), "created staff account", rec.name, "Staff");
    return json(strip(rec), existing ? 200 : 201);
  }

  // Bulk plantilla import: [{username, itemNo, positionTitle, ...}]
  if (req.method === "PUT") {
    if (!hasRole(me, "records")) return json({ error: "Only the AO / ADAS or the Principal can import plantilla items." }, 403);
    const rows = await req.json().catch(() => null);
    if (!Array.isArray(rows)) return json({ error: "Expected a list." }, 400);
    let updated = 0; const missing = [];
    for (const row of rows) {
      const rec = await staff.get(clean(row.username).toLowerCase(), { type: "json" });
      if (!rec) { missing.push(row.username || "(blank)"); continue; }
      rec.plantilla = Object.fromEntries(PLANTILLA.map((k) => [k, clean(row[k], 120)]));
      await staff.setJSON(rec.username, rec); updated++;
    }
    await logActivity(staffLabel(me), "imported plantilla items", `${updated} teachers`, "HR");
    return json({ updated, missing });
  }

  if (req.method === "DELETE") {
    const username = url.searchParams.get("username");
    const rec = username && (await staff.get(username, { type: "json" }));
    if (!rec) return json({ error: "Not found" }, 404);
    await staff.delete(username);
    await logActivity(staffLabel(me), rec.status === "pending" ? "disapproved account request" : "deleted staff account", rec.name, "Staff");
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
};

export const config = { path: "/api/admin/staff" };
