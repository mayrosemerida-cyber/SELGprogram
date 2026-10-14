// Learner portal: sign in with LRN + access code, then view own report cards and e-School ID.
import { json, seal, cookie, learnerSession, getStaff, canManageLearner, safeEqual, checkLock, recordFail, clearFails, sectionOfLearner, logActivity } from "../lib/auth.mjs";
import { store, getFile } from "../lib/store.mjs";
import { getSettings } from "../lib/settings.mjs";

const HOURS_2 = 60 * 60 * 2;
async function school() {
  const st = await getSettings();
  return {
    name: st.schoolName, address: st.address, principal: st.headName, schoolId: st.schoolId,
    short: st.schoolShort, logoKey: st.logoKey, colorPrimary: st.colorPrimary, colorAccent: st.colorAccent,
    email: st.email, idTitle: st.idTitle, idAddress: st.idAddress, idHeadTitle: st.idHeadTitle, idRules: st.idRules,
    idBgKey: st.idBgKey, schoolPhotoKey: st.schoolPhotoKey,
  };
}

// What a learner is allowed to see about themselves (never the access code)
async function publicProfile(l) {
  const sec = await sectionOfLearner(l);
  let adviserName = "";
  if (sec?.adviser) adviserName = (await store("staff").get(sec.adviser, { type: "json" }))?.name || "";
  return {
    sectionId: sec?.id || "", adviserName, sex: l.sex || "",
    status: l.status || "enrolled", statusDate: l.statusDate || "", transferredTo: l.transferredTo || "",
    selgOfficer: !!l.selgOfficer,
    lrn: l.lrn, lastName: l.lastName, firstName: l.firstName, middleName: l.middleName,
    grade: l.grade, section: l.section, birthdate: l.birthdate,
    guardian: l.guardian, guardianContact: l.guardianContact, address: l.address,
    schoolYear: l.schoolYear, hasPhoto: !!l.photoKey, photoVersion: l.photoVersion || 0,
    cards: (l.cards || []).map(({ id, label, contentType, uploadedAt }) => ({ id, label, contentType, uploadedAt })),
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const action = url.pathname.split("/").pop();
  const learners = store("learners");

  if (action === "login" && req.method === "POST") {
    if (!process.env.SESSION_SECRET) return json({ error: "Portal is not set up yet." }, 500);
    const body = await req.json().catch(() => ({}));
    const lrn = String(body.lrn || "").replace(/\D/g, "");
    const code = String(body.code || "").trim().toUpperCase();
    if (lrn.length !== 12 || !code) return json({ error: "Enter your 12-digit LRN and access code." }, 400);

    const lockKey = "lrn-" + lrn;
    const mins = await checkLock(lockKey);
    if (mins) return json({ error: `Too many wrong tries. Try again in ${mins} minute(s).` }, 429);

    const learner = await learners.get(lrn, { type: "json" });
    if (!learner || !safeEqual(code, learner.code)) {
      await recordFail(lockKey);
      return json({ error: "LRN or access code is incorrect. Ask your adviser if you need help." }, 401);
    }
    await clearFails(lockKey);
    await logActivity(`${learner.firstName} ${learner.lastName} (LRN ${lrn})`, "signed in", "", "Learner Portal");
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json", "Set-Cookie": cookie("learner", seal({ lrn }, HOURS_2), HOURS_2) },
    });
  }

  if (action === "logout") {
    return new Response(null, { status: 302, headers: { Location: "/portal.html", "Set-Cookie": cookie("learner", "", 0) } });
  }

  // Staff (admin, or the learner's class adviser) may preview a learner with ?lrn=
  const asked = url.searchParams.get("lrn");
  const staff = asked ? await getStaff(req) : null;
  const session = learnerSession(req);
  const lrn = staff ? asked : session?.lrn;
  if (!lrn) return json({ error: "Please sign in." }, 401);
  const learner = await learners.get(lrn, { type: "json" });
  if (!learner) return json({ error: "Record not found." }, 404);
  if (staff && !canManageLearner(staff, learner)) return json({ error: "Not your section." }, 403);

  if (action === "me") return json({ learner: await publicProfile(learner), school: await school() });

  // Stream the learner's own photo or report card
  if (action === "file") {
    const what = url.searchParams.get("what");
    let key;
    if (what === "photo") key = learner.photoKey;
    else key = (learner.cards || []).find((c) => c.id === url.searchParams.get("id"))?.key;
    if (!key) return new Response("Not found", { status: 404 });
    const file = await getFile("private", key);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.data, {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, no-store",
        "Content-Disposition": "inline",
        "X-Robots-Tag": "noindex",
      },
    });
  }

  return json({ error: "Not found" }, 404);
};

export const config = { path: ["/api/learner/login", "/api/learner/logout", "/api/learner/me", "/api/learner/file"] };
