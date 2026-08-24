import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { apiClient } from "../auth.js";

// The tenant's Media Vault. The files themselves live in IQEX's asset store —
// UIIQ (and therefore this MCP) browses, uploads, generates and deletes
// through UIIQ's /api/assets routes, which carry the tenant's org key
// server-side. Nothing here talks to IQEX directly.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

const MIME_BY_EXT = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
  webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};

/**
 * The shared caller forces `Content-Type: application/json`, which corrupts
 * multipart. Serialise the FormData through a Request first so the real
 * boundary header comes with it and can override.
 */
async function multipart(form) {
  const req = new Request("http://multipart.local", { method: "POST", body: form });
  return {
    body: Buffer.from(await req.arrayBuffer()),
    contentType: req.headers.get("content-type"),
  };
}

export const mediaTools = [
  {
    name: "uiiq_media_list",
    description:
      "List the tenant's Media Vault (images and video, stored in IQEX). Returns { total, page, hasNext, assets } — each asset has id, name, type, category and a public URL. Assets with category 'sting' are the tenant's logo sting (appended to the end of rendered videos; most recent wins).",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["image", "video", "audio"], description: "Filter by kind. Omit for everything." },
        page: { type: "number", description: "Page number, from 1." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ type, page, tenant } = {}) {
      const qs = new URLSearchParams();
      if (type) qs.set("type", type);
      if (page) qs.set("page", String(page));
      const res = await api(tenant)(`/assets${qs.size ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_media_upload",
    description:
      "Upload an image or video into the tenant's Media Vault from a local file path or a URL. Set category 'sting' to make it the tenant's logo sting (must be a video; the most recent sting is the one appended to rendered videos). Returns the created asset.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Local file path to upload. One of path or url is required." },
        url: { type: "string", description: "http(s) URL to fetch and upload. One of path or url is required." },
        name: { type: "string", description: "Display name for the asset. Defaults to the file name." },
        category: { type: "string", description: "Asset category, e.g. 'library' (default) or 'sting'." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ path, url, name, category, tenant } = {}) {
      if (!path && !url) throw new Error("Provide a local `path` or a `url` to upload.");
      if (path && url) throw new Error("Provide `path` or `url`, not both.");

      let bytes, filename, mime;
      if (path) {
        bytes = await readFile(path);
        filename = basename(path);
        mime = MIME_BY_EXT[filename.split(".").pop()?.toLowerCase() ?? ""];
        if (!mime) throw new Error(`Unsupported file type: ${filename} — use jpg/png/gif/webp/mp4/mov/webm.`);
      } else {
        if (!/^https?:\/\//i.test(url)) throw new Error("URL must be http(s).");
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`);
        mime = res.headers.get("content-type")?.split(";")[0] ?? "";
        if (!Object.values(MIME_BY_EXT).includes(mime)) {
          throw new Error(`Unsupported content type from URL: ${mime || "unknown"}.`);
        }
        bytes = Buffer.from(await res.arrayBuffer());
        filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "upload");
      }

      if (category === "sting" && !mime.startsWith("video/")) {
        throw new Error("A logo sting has to be a video — it plays at the end of rendered videos.");
      }

      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mime }), filename);
      if (name) form.append("name", name);
      form.append("category", category || "library");

      const { body, contentType } = await multipart(form);
      const res = await api(tenant)("/assets/upload", {
        method: "POST",
        body,
        headers: { "Content-Type": contentType },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_media_generate",
    description:
      "Generate an image or video with AI into the tenant's Media Vault (IQEX does the generating and charges the org's credits; the result appears in the vault when ready — video takes a few minutes). For video, ground the generation on the tenant's own media: imageAssetId makes that image the opening frame (image-to-video); videoAssetId carries that clip's style and subjects into the new one (reference-to-video — how a tenant keeps a series looking consistent). Video sizes accepted: 1280x720, 720x1280, 1920x1080, 1080x1920 — square is refused.",
    inputSchema: {
      type: "object",
      required: ["kind", "prompt"],
      properties: {
        kind: { type: "string", enum: ["image", "video"] },
        prompt: { type: "string", description: "What to make, in plain words." },
        name: { type: "string", description: "Name for the asset (optional)." },
        width: { type: "number", description: "Video only. Pair with height as one of the accepted sizes." },
        height: { type: "number", description: "Video only." },
        imageAssetId: { type: "number", description: "Video only: vault image id to use as the opening frame." },
        videoAssetId: { type: "number", description: "Video only: vault video id whose style the new clip should match. Wins over imageAssetId if both are given." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ kind, prompt, name, width, height, imageAssetId, videoAssetId, tenant }) {
      const body = { kind, prompt };
      if (name) body.name = name;
      if (width) body.width = width;
      if (height) body.height = height;
      if (imageAssetId) body.imageAssetId = imageAssetId;
      if (videoAssetId) body.videoAssetId = videoAssetId;
      const res = await api(tenant)("/assets/generate", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_media_delete",
    description:
      "Delete an asset from the tenant's Media Vault permanently — cannot be undone. Refuses ids that are not in this tenant's library. Useful for clearing failed AI generations that sit as dead 'Processing…' rows.",
    inputSchema: {
      type: "object",
      required: ["assetId"],
      properties: {
        assetId: { type: "number", description: "The asset id to delete (from uiiq_media_list)." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ assetId, tenant }) {
      if (!Number.isInteger(assetId) || assetId <= 0) throw new Error("assetId must be a positive whole number.");
      const res = await api(tenant)(`/assets/${assetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
