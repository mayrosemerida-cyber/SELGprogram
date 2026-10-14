// Site Settings: anyone can read; only the Website Administrator can change (the Taga-Silangan Adviser: the paper's own design).
import { json, getStaff, hasRole, savePhotos } from "../lib/auth.mjs";
import { store } from "../lib/store.mjs";
import { getSettings, TEXT_KEYS, IMAGE_KEYS, PAPER_TEXT_KEYS, PAPER_IMAGE_KEYS } from "../lib/settings.mjs";
import { logActivity, staffLabel } from "../lib/auth.mjs";

const COLOR_RE = /^#[0-9a-f]{6}$/i;

export default async (req) => {
  if (req.method === "GET") {
    return new Response(JSON.stringify(await getSettings()), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=0, must-revalidate" },
    });
  }

  const me = await getStaff(req);
  const isAdmin = hasRole(me, "admin");
  if (!isAdmin && !hasRole(me, "paper")) return json({ error: "Only the Website Administrator can change site settings." }, 403);
  const textKeys = isAdmin ? TEXT_KEYS : PAPER_TEXT_KEYS, imageKeys = isAdmin ? IMAGE_KEYS : PAPER_IMAGE_KEYS;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const form = await req.formData();
  const current = await getSettings();
  const next = { ...current };
  for (const k of textKeys) {
    if (form.has(k)) next[k] = String(form.get(k)).trim().slice(0, 3000);
  }
  for (const k of ["colorPrimary", "colorAccent"]) if (!COLOR_RE.test(next[k])) next[k] = current[k];
  next.schoolShort = next.schoolShort.slice(0, 3).toUpperCase();

  const media = store("media");
  try {
    for (const k of imageKeys) {
      const name = k.replace("Key", "");
      if (form.get(`remove_${name}`) === "on" && next[k]) { await media.delete(next[k]); next[k] = ""; }
      const file = form.get(name);
      if (file instanceof Blob && file.size > 0) {
        const [key] = await savePhotos([file], `site-${name}`);
        if (next[k]) await media.delete(next[k]);
        next[k] = key;
      }
    }
  } catch (e) {
    return json({ error: e.message }, 400);
  }

  if (next.paperFacebook && !/^https:\/\/(www\.|m\.|web\.)?(facebook|fb)\.com\//i.test(next.paperFacebook)) return json({ error: "The Facebook link should start with https://www.facebook.com/" }, 400);
  await store("settings").setJSON("site", next);
  if (!isAdmin) await logActivity(staffLabel(me), "updated the Taga-Silangan page design", "", "Taga-Silangan");
  return json(next);
};

export const config = { path: "/api/settings" };
