// Storage helper. On Netlify this uses Netlify Blobs (built-in, no setup).
// For local testing, set LOCAL_BLOBS_DIR to use plain files instead.
import { getStore as netlifyStore } from "@netlify/blobs";
import fs from "node:fs/promises";
import path from "node:path";

function fileStore(name) {
  const root = path.join(process.env.LOCAL_BLOBS_DIR, name);
  const p = (key) => path.join(root, encodeURIComponent(key));
  return {
    async set(key, data, opts = {}) {
      await fs.mkdir(root, { recursive: true });
      const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data);
      await fs.writeFile(p(key), buf);
      await fs.writeFile(p(key) + ".meta", JSON.stringify(opts.metadata || {}));
    },
    async setJSON(key, obj) { return this.set(key, JSON.stringify(obj)); },
    async get(key, opts = {}) {
      try {
        const buf = await fs.readFile(p(key));
        if (opts.type === "json") return JSON.parse(buf.toString());
        if (opts.type === "arrayBuffer") return buf;
        return buf.toString();
      } catch { return null; }
    },
    async getWithMetadata(key) {
      try {
        const data = await fs.readFile(p(key));
        const metadata = JSON.parse(await fs.readFile(p(key) + ".meta", "utf8"));
        return { data, metadata };
      } catch { return null; }
    },
    async list({ prefix = "" } = {}) {
      let names = [];
      try { names = await fs.readdir(root); } catch {}
      const blobs = names.filter((n) => !n.endsWith(".meta"))
        .map((n) => ({ key: decodeURIComponent(n) }))
        .filter((b) => b.key.startsWith(prefix));
      return { blobs };
    },
    async delete(key) {
      await fs.rm(p(key), { force: true });
      await fs.rm(p(key) + ".meta", { force: true });
    },
  };
}

export function store(name) {
  if (process.env.LOCAL_BLOBS_DIR) return fileStore(name);
  return netlifyStore({ name, consistency: "strong" });
}

// Read a blob as bytes + content type
export async function getFile(storeName, key) {
  const s = store(storeName);
  const res = await s.getWithMetadata(key, { type: "arrayBuffer" });
  if (!res || !res.data) return null;
  return { data: res.data, contentType: res.metadata?.contentType || "application/octet-stream" };
}

export async function listJSON(storeName, prefix) {
  const s = store(storeName);
  const { blobs } = await s.list({ prefix });
  const items = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return items.filter(Boolean);
}
