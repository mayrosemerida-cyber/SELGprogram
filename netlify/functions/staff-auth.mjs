// Staff sign-in (with optional two-step code) / sign-out / who-am-I / change password / request an account / two-step setup
import {
  json, seal, unseal, getCookie, cookie, getStaff, hasRole, safeEqual, checkPassword, hashPassword, checkLock, recordFail,
  clearFails, clientIp, SUPER, ROLE_LABELS, clean, logActivity, staffLabel,
} from "../lib/auth.mjs";
import { store } from "../lib/store.mjs";
import { notifyUsers, usersWithRole } from "../lib/push.mjs";
import {
  passwordProblem, verifyTotp, newTotpSecret, get2fa, save2fa, delete2fa, twoStepBypassed, newRecoveryCodes, useRecoveryCode,
} from "../lib/security.mjs";

const HOURS_12 = 60 * 60 * 12;
const loginCookie = (u, v) => cookie("staff", seal({ u, v }, HOURS_12), HOURS_12);
const USER_RE = /^[a-z0-9._-]{3,30}$/;
const ok = (headers = {}) => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...headers } });

export default async (req, context) => {
  const action = new URL(req.url).pathname.split("/").pop();
  const staffStore = store("staff");

  if (action === "check") {
    const me = await getStaff(req);
    if (!me) return json({ signedIn: false });
    const tf = await get2fa(me.username);
    return json({
      signedIn: true, ...me, roleLabels: me.roles.map((r) => ROLE_LABELS[r]),
      twoStep: { enabled: !!tf.enabled, recoveryLeft: (tf.recovery || []).length, recommended: hasRole(me, "admin", "principal") && !tf.enabled },
      weakAdminPassword: me.username === SUPER && !!passwordProblem(process.env.ADMIN_PASSWORD, { username: SUPER }),
    });
  }
  if (action === "logout") {
    const headers = new Headers({ Location: "/admin.html" });
    headers.append("Set-Cookie", cookie("staff", "", 0));
    headers.append("Set-Cookie", cookie("staff2fa", "", 0));
    return new Response(null, { status: 302, headers });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!process.env.SESSION_SECRET || !process.env.ADMIN_PASSWORD) {
    return json({ error: "Site is not set up yet: add ADMIN_PASSWORD and SESSION_SECRET in Netlify." }, 500);
  }

  /* ----- Step 1: username + password ----- */
  if (action === "login") {
    const body = await req.json().catch(() => ({}));
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");
    const lockKey = `staff-${username}-${clientIp(req, context)}`;
    const mins = await checkLock(lockKey);
    if (mins) return json({ error: `Too many wrong tries. Try again in ${mins} minute(s).` }, 429);

    let good = false, version = 0, rec = null;
    if (username === SUPER) good = safeEqual(password, process.env.ADMIN_PASSWORD);
    else {
      rec = username && (await staffStore.get(username, { type: "json" }));
      good = !!rec && checkPassword(password, rec.passwordHash);
      version = rec?.version;
    }
    if (!good) { await recordFail(lockKey); return json({ error: "Wrong username or password." }, 401); }
    if (rec && rec.status === "pending") return json({ error: "Your account is waiting for the Principal's approval." }, 403);
    if (rec && rec.status !== "active") return json({ error: "This account is disabled. Please contact the Principal." }, 403);
    await clearFails(lockKey);

    const tf = await get2fa(username);
    if (tf.enabled && !twoStepBypassed(username)) {
      // Password was right; now ask for the 6-digit code (valid for 5 minutes)
      return new Response(JSON.stringify({ needCode: true }), {
        headers: { "Content-Type": "application/json", "Set-Cookie": cookie("staff2fa", seal({ u: username, v: version }, 300), 300) },
      });
    }
    await logActivity(rec ? `${rec.name} (${username})` : "Website Administrator (admin)", "signed in", "", "Staff");
    return ok({ "Set-Cookie": loginCookie(username, version) });
  }

  /* ----- Step 2: 6-digit code from the authenticator app (or a recovery code) ----- */
  if (action === "verify") {
    const pending = unseal(getCookie(req, "staff2fa"));
    if (!pending?.u) return json({ error: "Sign-in expired. Please enter your password again." }, 401);
    const lockKey = `2fa-${pending.u}`;
    const mins = await checkLock(lockKey);
    if (mins) return json({ error: `Too many wrong codes. Try again in ${mins} minute(s).` }, 429);
    const { code } = await req.json().catch(() => ({}));
    const tf = await get2fa(pending.u);
    let passed = false, how = "code";
    const counter = tf.enabled ? verifyTotp(tf.secret, code, tf.lastCounter ?? -1) : -1;
    if (counter >= 0) { tf.lastCounter = counter; passed = true; }
    else {
      const left = tf.enabled ? useRecoveryCode(tf, code) : null;
      if (left) { tf.recovery = left; passed = true; how = "recovery code"; }
    }
    if (!passed) { await recordFail(lockKey); return json({ error: "That code is not correct. Check your authenticator app and try again." }, 401); }
    await clearFails(lockKey);
    await save2fa(pending.u, tf);
    const rec = pending.u === SUPER ? null : await staffStore.get(pending.u, { type: "json" });
    await logActivity(rec ? `${rec.name} (${pending.u})` : "Website Administrator (admin)", `signed in with two-step ${how}`, how === "recovery code" ? `${tf.recovery.length} recovery codes left` : "", "Staff");
    const headers = new Headers({ "Content-Type": "application/json" });
    headers.append("Set-Cookie", loginCookie(pending.u, pending.v));
    headers.append("Set-Cookie", cookie("staff2fa", "", 0));
    return new Response(JSON.stringify({ ok: true, recoveryLeft: (tf.recovery || []).length }), { headers });
  }

  /* ----- New teachers ask for an account ----- */
  if (action === "register") {
    const b = await req.json().catch(() => ({}));
    const username = clean(b.username).toLowerCase();
    if (!USER_RE.test(username) || username === SUPER) return json({ error: "Username: 3–30 letters, numbers, dots or dashes." }, 400);
    if (await staffStore.get(username)) return json({ error: "That username is already taken." }, 400);
    if (!clean(b.name)) return json({ error: "Enter your full name." }, 400);
    const bad = passwordProblem(b.password, { username, name: b.name });
    if (bad) return json({ error: bad }, 400);
    const lockKey = `register-${clientIp(req, context)}`;
    if (await checkLock(lockKey)) return json({ error: "Too many requests. Try again later." }, 429);
    await recordFail(lockKey); // limits sign-up spam to 5 per 15 minutes per device
    await staffStore.setJSON(username, {
      username, name: clean(b.name), position: clean(b.position), email: clean(b.email),
      roles: ["teacher"], status: "pending", version: 0,
      passwordHash: hashPassword(b.password), createdAt: Date.now(),
    });
    await logActivity(`${clean(b.name)} (${username})`, "requested a staff account", clean(b.position), "Staff");
    await notifyUsers(await usersWithRole("admin", "principal"), { title: "👤 New staff account request", body: `${clean(b.name)}${clean(b.position) ? ", " + clean(b.position) : ""}`, url: "/admin.html#staff", tag: "req-" + username });
    return json({ ok: true });
  }

  const me = await getStaff(req);
  if (!me) return json({ error: "Please sign in." }, 401);

  /* ----- Change own password ----- */
  if (action === "password") {
    if (me.username === SUPER) return json({ error: "The built-in admin password is changed in Netlify (ADMIN_PASSWORD)." }, 400);
    const { current, next } = await req.json().catch(() => ({}));
    const rec = await staffStore.get(me.username, { type: "json" });
    if (!checkPassword(current, rec.passwordHash)) return json({ error: "Current password is wrong." }, 400);
    const bad = passwordProblem(next, { username: me.username, name: rec.name });
    if (bad) return json({ error: bad }, 400);
    if (checkPassword(next, rec.passwordHash)) return json({ error: "Choose a password different from your current one." }, 400);
    rec.passwordHash = hashPassword(next);
    rec.version = (rec.version || 0) + 1; // signs out other devices
    await staffStore.setJSON(me.username, rec);
    await logActivity(staffLabel(me), "changed password", "", "Staff");
    return ok({ "Set-Cookie": loginCookie(me.username, rec.version) });
  }

  /* ----- Two-step sign-in setup ----- */
  if (action === "2fa") {
    const b = await req.json().catch(() => ({}));
    const tf = await get2fa(me.username);

    if (b.action === "setup") {
      if (tf.enabled) return json({ error: "Two-step sign-in is already on." }, 400);
      tf.pendingSecret = newTotpSecret();
      await save2fa(me.username, tf);
      const label = encodeURIComponent(`RECS Website:${me.username}`);
      return json({ secret: tf.pendingSecret, otpauth: `otpauth://totp/${label}?secret=${tf.pendingSecret}&issuer=${encodeURIComponent("RECS Website")}&digits=6&period=30` });
    }
    if (b.action === "enable") {
      if (!tf.pendingSecret) return json({ error: "Start the setup again." }, 400);
      const counter = verifyTotp(tf.pendingSecret, b.code);
      if (counter < 0) return json({ error: "That code is not correct. Make sure your phone's time is set automatically, then try the newest code." }, 400);
      const { codes, hashes } = newRecoveryCodes();
      await save2fa(me.username, { enabled: true, secret: tf.pendingSecret, lastCounter: counter, recovery: hashes, enabledAt: Date.now() });
      await logActivity(staffLabel(me), "turned on two-step sign-in", "", "Security");
      return json({ ok: true, recoveryCodes: codes });
    }
    if (b.action === "disable") {
      if (!tf.enabled) return json({ ok: true });
      const good = verifyTotp(tf.secret, b.code, tf.lastCounter ?? -1) >= 0 || !!useRecoveryCode(tf, b.code);
      if (!good) return json({ error: "Enter a current code from your authenticator app (or a recovery code) to turn it off." }, 400);
      await delete2fa(me.username);
      await logActivity(staffLabel(me), "turned off two-step sign-in", "", "Security");
      return json({ ok: true });
    }
    if (b.action === "newcodes") {
      if (!tf.enabled) return json({ error: "Two-step sign-in is off." }, 400);
      if (verifyTotp(tf.secret, b.code, tf.lastCounter ?? -1) < 0) return json({ error: "Enter a current code from your authenticator app." }, 400);
      const { codes, hashes } = newRecoveryCodes();
      tf.recovery = hashes;
      await save2fa(me.username, tf);
      await logActivity(staffLabel(me), "made new two-step recovery codes", "", "Security");
      return json({ ok: true, recoveryCodes: codes });
    }
    // Principal can reset a teacher who lost their phone
    if (b.action === "reset") {
      if (!hasRole(me, "admin", "principal")) return json({ error: "Only the Principal or the Website Administrator can reset two-step sign-in." }, 403);
      const u = clean(b.username).toLowerCase();
      if (!u || u === me.username) return json({ error: "Choose a staff account." }, 400);
      await delete2fa(u);
      const rec = await staffStore.get(u, { type: "json" });
      if (rec) { rec.version = (rec.version || 0) + 1; await staffStore.setJSON(u, rec); }
      await logActivity(staffLabel(me), "reset two-step sign-in", rec?.name || u, "Security");
      return json({ ok: true });
    }
    return json({ error: "Unknown action." }, 400);
  }

  return json({ error: "Not found" }, 404);
};

export const config = {
  path: ["/api/staff/login", "/api/staff/verify", "/api/staff/logout", "/api/staff/check", "/api/staff/password", "/api/staff/register", "/api/staff/2fa"],
};
