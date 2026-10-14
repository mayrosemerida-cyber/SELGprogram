import crypto from "node:crypto";
import { seal, unseal, getCookie, cookie } from "./session.mjs";
import { store, listJSON } from "./store.mjs";

export { seal, unseal, getCookie, cookie };

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/* ---------------- Staff roles ----------------
   principal – Principal: approves leave, posts and uploads; service credits & plantilla; sees every class
   records – AO / ADAS: service credits and plantilla for all teachers; sees leave records (does not approve)
   admin   – Website Administrator: staff accounts, sections, site design (not leave or approvals)
   adviser – Class adviser (sections are assigned under Sections)
   paper   – Taga-Silangan (school paper) adviser
   selg    – SELG adviser
   teacher – Every teacher: announcements (need approval), leave, write-ups
*/
export const ROLES = ["principal", "admin", "records", "adviser", "paper", "selg", "teacher"];
export const ROLE_LABELS = {
  principal: "Principal", admin: "Website Administrator", records: "AO / ADAS (Service Credits)", adviser: "Class Adviser", paper: "Taga-Silangan Adviser",
  selg: "SELG Adviser", teacher: "Teacher",
};
export const SUPER = "admin"; // built-in account that uses ADMIN_PASSWORD

/* ---------------- Passwords ---------------- */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(String(pw), salt, 32).toString("hex")}`;
}
export function checkPassword(pw, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(":");
  return safeEqual(crypto.scryptSync(String(pw), salt, 32).toString("hex"), hash);
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/* ---------------- Sections ---------------- */
export async function allSections() {
  return (await listJSON("sections", "")).sort((a, b) =>
    gradeNum(a.grade) - gradeNum(b.grade) || a.name.localeCompare(b.name));
}
export const gradeNum = (g) => (/kinder/i.test(g) ? 0 : parseInt(String(g).replace(/\D/g, "")) || 99);
const norm = (s) => String(s || "").trim().toLowerCase();
export const sameSection = (sec, grade, name) =>
  norm(sec.name) === norm(name) && (!grade || !sec.grade || gradeNum(sec.grade) === gradeNum(grade));

/* ---------------- Staff sessions ---------------- */
// Returns { username, name, roles, sections:[{id,grade,name}] } or null
export async function getStaff(req) {
  // Pages in the Learner Portal say "act as the learner", so a teacher who is also
  // signed in on the same browser doesn't get mixed up with the learner.
  if (req.headers.get("x-portal") === "learner" || new URL(req.url).searchParams.get("as") === "learner") return null;
  const s = unseal(getCookie(req, "staff"));
  if (!s || !s.u) return null;
  let me;
  if (s.u === SUPER) {
    me = { username: SUPER, name: "Website Administrator", roles: ["admin"] };
  } else {
    const rec = await store("staff").get(s.u, { type: "json" });
    if (!rec || rec.status !== "active" || rec.version !== s.v) return null;
    me = { username: rec.username, name: rec.name, roles: rec.roles || [], position: rec.position || "" };
  }
  me.sections = (await allSections()).filter((x) => x.adviser === me.username).map(({ id, grade, name }) => ({ id, grade, name }));
  return me;
}

export const hasRole = (staff, ...roles) =>
  !!staff && (roles.some((r) => staff.roles.includes(r)) ||
    // The Principal and the Website Administrator can each help with every role except the other's
    (staff.roles.includes("admin") && !roles.includes("principal") && !roles.includes("records")) ||
    (staff.roles.includes("principal") && !roles.includes("admin")));
// The Website Administrator is NOT the Principal: only "principal" approves leave and announcements.
export const isPrincipal = (staff) => !!staff && staff.roles.includes("principal");
// Principal and Website Administrator both oversee every class, staff and sections
export const isHead = (staff) => hasRole(staff, "admin", "principal");

// Class advisers may only touch learners in the section(s) they advise
export function canManageLearner(staff, learner) {
  if (isHead(staff)) return true;
  return !!staff?.sections.some((sec) => sameSection(sec, learner.grade, learner.section));
}

export function learnerSession(req) {
  const s = unseal(getCookie(req, "learner"));
  return s && s.lrn ? s : null;
}
export async function getLearner(req) {
  const s = learnerSession(req);
  return s ? store("learners").get(s.lrn, { type: "json" }) : null;
}

/* ---------------- Newsroom (Taga-Silangan) sessions: separate accounts ---------------- */
export async function getNewsroom(req) {
  const s = unseal(getCookie(req, "news"));
  if (!s || !s.u) return null;
  const rec = await store("newsroom").get(s.u, { type: "json" });
  if (!rec || rec.status !== "active" || rec.version !== s.v) return null;
  return { username: rec.username, name: rec.name, role: rec.role, parts: rec.parts || [] };
}

/* ---------------- Lockout after wrong tries ---------------- */
const MAX_TRIES = 5, LOCK_MS = 15 * 60 * 1000;
export async function checkLock(key) {
  const rec = await store("ratelimit").get(key, { type: "json" });
  return rec && rec.until > Date.now() ? Math.ceil((rec.until - Date.now()) / 60000) : 0;
}
export async function recordFail(key) {
  const s = store("ratelimit");
  const rec = (await s.get(key, { type: "json" })) || { fails: 0 };
  if (rec.until && rec.until <= Date.now()) { rec.fails = 0; rec.until = 0; }
  rec.fails += 1;
  if (rec.fails >= MAX_TRIES) rec.until = Date.now() + LOCK_MS;
  await s.setJSON(key, rec);
}
export async function clearFails(key) { await store("ratelimit").delete(key); }
export const clientIp = (req, context) => context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";

/* ---------------- Activity log ---------------- */
export async function logActivity(who, action, detail = "", area = "") {
  try {
    const at = Date.now();
    const key = `${String(at).padStart(14, "0")}-${crypto.randomBytes(3).toString("hex")}`;
    await store("activity").setJSON(key, { at, who: String(who || "unknown").slice(0, 120), action, detail: String(detail).slice(0, 300), area });
  } catch {}
}
export const staffLabel = (me) => (me ? `${me.name} (${me.username})` : "unknown");

/* ---------------- Misc ---------------- */
export function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(6), (b) => chars[b % chars.length]).join("");
}
export const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
export const MAX_UPLOAD = 4.5 * 1024 * 1024; // Netlify request limit is ~6 MB
export const clean = (v, max = 200) => String(v ?? "").trim().slice(0, max);
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const DOC_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword", "application/vnd.ms-excel",
];

// Save uploaded files to a store; returns [{key, name, type, size}]
export async function saveFiles(files, prefix, { storeName = "media", types = IMAGE_TYPES, label = "File" } = {}) {
  const s = store(storeName);
  const out = [];
  for (const file of files) {
    if (!(file instanceof Blob) || file.size === 0) continue;
    if (!types.includes(file.type)) throw new Error(`${label} type not allowed (${file.name || file.type}).`);
    if (file.size > MAX_UPLOAD) throw new Error(`${file.name || label} is too large (max 4.5 MB).`);
    const key = `${prefix}-${out.length}-${crypto.randomBytes(4).toString("hex")}`;
    await s.set(key, await file.arrayBuffer(), { metadata: { contentType: file.type } });
    out.push({ key, name: clean(file.name, 120) || "file", type: file.type, size: file.size });
  }
  return out;
}
export async function savePhotos(files, prefix) {
  return (await saveFiles(files, prefix, { label: "Photo" })).map((f) => f.key);
}

// Which section record a learner belongs to
export async function sectionOfLearner(l) {
  if (!l) return null;
  return (await allSections()).find((s) => sameSection(s, l.grade, l.section)) || null;
}
// Can this staff member manage this section?
export const canManageSection = (me, sec) => !!me && !!sec && (isHead(me) || sec.adviser === me.username);
