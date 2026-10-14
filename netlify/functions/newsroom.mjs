// Taga-Silangan Newsroom accounts (separate from the Learner Portal and staff sign-in).
// Writers, editors and coordinators sign in here. The Taga-Silangan Adviser creates the accounts
// and assigns each coordinator the part(s) of the paper they check.
import {
  json, seal, cookie, getStaff, hasRole, getNewsroom, checkPassword, hashPassword, checkLock, recordFail,
  clearFails, clientIp, clean, logActivity, staffLabel,
} from "../lib/auth.mjs";
import { store, listJSON } from "../lib/store.mjs";
import { PARTS, NEWS_ROLES } from "../lib/newsroom.mjs";
import { passwordProblem } from "../lib/security.mjs";

const HOURS_8 = 60 * 60 * 8;
const USER_RE = /^[a-z0-9._-]{3,30}$/;
const strip = ({ passwordHash, ...r }) => r;
const loginCookie = (u, v) => cookie("news", seal({ u, v }, HOURS_8), HOURS_8);

export default async (req, context) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop(); // login | logout | check | password | accounts | parts
  const accounts = store("newsroom");

  if (action === "parts") return json({ parts: PARTS, roles: NEWS_ROLES });

  if (action === "check") {
    const me = await getNewsroom(req);
    return json(me ? { signedIn: true, ...me, roleLabel: NEWS_ROLES[me.role] } : { signedIn: false });
  }
  if (action === "logout") {
    return new Response(null, { status: 302, headers: { Location: "/newsroom.html", "Set-Cookie": cookie("news", "", 0) } });
  }

  if (action === "login" && req.method === "POST") {
    if (!process.env.SESSION_SECRET) return json({ error: "Site is not set up yet." }, 500);
    const b = await req.json().catch(() => ({}));
    const username = clean(b.username).toLowerCase();
    const lockKey = `news-${username}-${clientIp(req, context)}`;
    const mins = await checkLock(lockKey);
    if (mins) return json({ error: `Too many wrong tries. Try again in ${mins} minute(s).` }, 429);
    const rec = username && (await accounts.get(username, { type: "json" }));
    if (!rec || !checkPassword(b.password, rec.passwordHash)) { await recordFail(lockKey); return json({ error: "Wrong username or password." }, 401); }
    if (rec.status !== "active") return json({ error: "This newsroom account is disabled. Ask the Taga-Silangan Adviser." }, 403);
    await clearFails(lockKey);
    await logActivity(`${rec.name} (newsroom: ${username})`, "signed in", "", "Taga-Silangan");
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": loginCookie(username, rec.version) } });
  }

  if (action === "password" && req.method === "POST") {
    const me = await getNewsroom(req);
    if (!me) return json({ error: "Please sign in." }, 401);
    const b = await req.json().catch(() => ({}));
    const rec = await accounts.get(me.username, { type: "json" });
    if (!checkPassword(b.current, rec.passwordHash)) return json({ error: "Current password is wrong." }, 400);
    const badNew = passwordProblem(b.next, { username: rec.username, name: rec.name });
    if (badNew) return json({ error: badNew }, 400);
    rec.passwordHash = hashPassword(b.next); rec.version = (rec.version || 0) + 1;
    await accounts.setJSON(rec.username, rec);
    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": loginCookie(rec.username, rec.version) } });
  }

  // ----- Account management: Taga-Silangan Adviser / Principal -----
  if (action === "accounts") {
    const staff = await getStaff(req);
    if (!hasRole(staff, "paper")) return json({ error: "Only the Taga-Silangan Adviser can manage newsroom accounts." }, 403);

    if (req.method === "GET") return json((await listJSON("newsroom", "")).map(strip).sort((a, b) => a.name.localeCompare(b.name)));

    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const username = clean(b.username).toLowerCase();
      if (!USER_RE.test(username)) return json({ error: "Username: 3–30 letters, numbers, dots or dashes." }, 400);
      const existing = await accounts.get(username, { type: "json" });
      if (b.isNew && existing) return json({ error: "That username is already taken." }, 400);
      const rec = existing || { username, status: "active", version: 0, createdAt: Date.now() };
      if ("name" in b) rec.name = clean(b.name) || username;
      if ("role" in b) rec.role = NEWS_ROLES[b.role] ? b.role : "writer";
      if ("parts" in b) rec.parts = (Array.isArray(b.parts) ? b.parts : []).filter((p) => PARTS.includes(p));
      if ("gradeSection" in b) rec.gradeSection = clean(b.gradeSection);
      if (b.status && b.status !== rec.status) { rec.status = b.status === "disabled" ? "disabled" : "active"; rec.version = (rec.version || 0) + 1; }
      if (b.password) {
        const bad = passwordProblem(b.password, { username, name: rec.name });
        if (bad) return json({ error: bad }, 400);
        rec.passwordHash = hashPassword(b.password); rec.version = (rec.version || 0) + 1;
      }
      if (!rec.passwordHash) return json({ error: "Set a password for the new account." }, 400);
      if (rec.role === "coordinator" && !rec.parts?.length) return json({ error: "Choose the part(s) this coordinator will check." }, 400);
      await accounts.setJSON(username, rec);
      await logActivity(staffLabel(staff), existing ? "updated newsroom account" : "created newsroom account", `${rec.name} – ${NEWS_ROLES[rec.role]}`, "Taga-Silangan");
      return json(strip(rec));
    }

    if (req.method === "DELETE") {
      const rec = await accounts.get(url.searchParams.get("username") || "", { type: "json" });
      if (!rec) return json({ error: "Not found" }, 404);
      await accounts.delete(rec.username);
      await logActivity(staffLabel(staff), "deleted newsroom account", rec.name, "Taga-Silangan");
      return json({ ok: true });
    }
  }

  return json({ error: "Not found" }, 404);
};

export const config = {
  path: ["/api/newsroom/login", "/api/newsroom/logout", "/api/newsroom/check", "/api/newsroom/password", "/api/newsroom/accounts", "/api/newsroom/parts"],
};
