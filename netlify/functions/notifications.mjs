// Counts of things waiting for this staff member (shown as badges in the Staff Dashboard)
import { json, getStaff, hasRole, canManageLearner } from "../lib/auth.mjs";
import { listJSON } from "../lib/store.mjs";

export default async (req) => {
  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);
  const head = hasRole(me, "admin", "principal"), principal = hasRole(me, "principal");
  const out = { excuses: 0, approvals: 0, staff: 0, leave: 0, paper: 0, myLeave: [] };

  const [posts, excuses, leave, staff, subs, learners] = await Promise.all([
    listJSON("posts", ""), listJSON("excuses", ""), listJSON("leave", ""),
    head ? listJSON("staff", "") : [], hasRole(me, "paper") ? listJSON("submissions", "") : [],
    me.sections.length || head ? listJSON("learners", "") : [],
  ]);

  out.approvals = posts.filter((p) => p.status === "pending" && ((p.type === "announcement" && principal) || (p.type === "selg" && hasRole(me, "selg")) || (p.type === "news" && hasRole(me, "paper")))).length;
  const byLrn = Object.fromEntries(learners.map((l) => [l.lrn, l]));
  out.excuses = excuses.filter((e) => e.status === "pending" && byLrn[e.lrn] && canManageLearner(me, byLrn[e.lrn])).length;
  if (head) out.staff = staff.filter((s) => s.status === "pending").length;
  if (principal) out.leave = leave.filter((l) => l.status === "pending" && l.username !== me.username).length;
  out.paper = subs.filter((s) => s.status === "checked").length;
  // Recently decided leave of my own (last 14 days)
  out.myLeave = leave.filter((l) => l.username === me.username && l.status !== "pending" && l.decidedAt > Date.now() - 14 * 864e5)
    .map(({ type, status, dateFrom, decidedAt }) => ({ type, status, dateFrom, decidedAt }));
  return json(out);
};

export const config = { path: "/api/notifications" };
