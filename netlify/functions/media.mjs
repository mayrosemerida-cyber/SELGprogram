// Serves public photos (announcements, SELG, newspaper)
import { getFile } from "../lib/store.mjs";

export default async (req) => {
  const key = decodeURIComponent(new URL(req.url).pathname.replace("/api/media/", ""));
  const file = key && (await getFile("media", key));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.data, {
    headers: { "Content-Type": file.contentType, "Cache-Control": "public, max-age=31536000, immutable" },
  });
};

export const config = { path: "/api/media/*" };
