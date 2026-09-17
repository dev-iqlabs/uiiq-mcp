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

/** The body POST /api/media/reframe takes: exactly one source, and only the options given. */
export function reframeBody({ assetId, url, targets, method, padColor, force } = {}) {
  if ((assetId == null) === !url) throw new Error("Provide assetId or url (one of them).");
  const body = { source: assetId != null ? { assetId: Number(assetId) } : { url } };
  if (targets?.length) body.targets = targets;
  if (method) body.method = method;
  if (padColor) body.padColor = padColor;
  if (force) body.force = true;
  return body;
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
        reframe: {
          type: "object",
          description: "Images only. Reframe straight after upload (by the new asset's id), so one call also yields the shapes. Same options as uiiq_media_reframe; pass {} for the tenant's defaults. The upload stands even if the reframe fails; the reframe result or error comes back beside it.",
          properties: {
            targets: { type: "array", items: { type: "string", enum: ["square", "landscape", "og", "thumb"] } },
            method: { type: "string", enum: ["pad", "crop"] },
            padColor: { type: "string", description: "#rrggbb" },
          },
        },
        tenant: TENANT_PROP,
      },
    },
    async handler({ path, url, name, category, reframe, tenant } = {}) {
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
      const asset = await res.json();

      if (reframe && mime.startsWith("image/") && asset?.id) {
        // The upload is done and stands on its own; a reframe that fails is
        // reported beside it, not allowed to fail the upload.
        const rres = await api(tenant)("/media/reframe", {
          method: "POST",
          body: JSON.stringify(reframeBody({ assetId: asset.id, ...reframe })),
        });
        asset.reframe = rres.ok ? await rres.json() : { status: rres.status, error: await rres.text() };
      }
      return asset;
    },
  },
  {
    name: "uiiq_media_reframe",
    description:
      "Make ready-sized copies of one of the workspace's OWN images: square (1080, cards), landscape (1600×900, heroes), og (1200×630, link previews) and thumb (480). " +
      "method 'pad' (default) keeps the whole image and fills the new space with a colour from its own edges (or a blurred backdrop when the edges are busy) — nothing on a poster is cut; 'crop' cuts to the shape (for photographs). No AI, no credits; never upscales; JPEG (PNG with transparency) plus WebP. " +
      "Source: a Media Vault image by assetId (checked against this workspace's IQEX organisation), or by url an image uploaded to UIIQ in this workspace's own folder. Anything else — another host, another workspace's file, an IQEX URL given as a url — is refused (403). " +
      "Shapes that already exist are returned, not remade, unless force. Owner or admin only; 30 reframes an hour per workspace (429 beyond). A call has a ~24 s budget: shapes not started in time come back in `unfinished` — call again for those. " +
      "Unreadable, animated, over 25 MB / 50 MP, or longer than 1:10 images are refused (422). The feed at /api/v1/experiences shows the shapes as images.square etc.",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "number", description: "Media Vault image id. One of assetId or url." },
        url: { type: "string", description: "https URL of an image uploaded to UIIQ in this workspace's folder. One of assetId or url." },
        targets: { type: "array", items: { type: "string", enum: ["square", "landscape", "og", "thumb"] }, description: "Which shapes. Default: the workspace's setting, else all four." },
        method: { type: "string", enum: ["pad", "crop"], description: "Default: the workspace's setting, else pad." },
        padColor: { type: "string", description: "pad only: #rrggbb instead of the sampled colour." },
        force: { type: "boolean", description: "Remake shapes that already exist (overwrites them)." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ assetId, url, targets, method, padColor, force, tenant } = {}) {
      const res = await api(tenant)("/media/reframe", {
        method: "POST",
        body: JSON.stringify(reframeBody({ assetId, url, targets, method, padColor, force })),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  },
  {
    name: "uiiq_media_derivatives",
    description:
      "The ready-sized copies already made for one image (target, url, webpUrl, width, height, bytes, format, status, method, untouched), from stored records only — nothing is fetched or made. Check here before reframing again. Give the same assetId or url you reframed with.",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "number", description: "Media Vault image id. One of assetId or url." },
        url: { type: "string", description: "The image URL that was reframed. One of assetId or url." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ assetId, url, tenant } = {}) {
      if ((assetId == null) === !url) throw new Error("Provide assetId or url (one of them).");
      const qs = new URLSearchParams(assetId != null ? { assetId: String(assetId) } : { url });
      const res = await api(tenant)(`/media/derivatives?${qs}`);
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
  },
  {
    name: "uiiq_media_generate",
    description:
      "Generate an image or video with AI into the tenant's Media Vault (IQEX does the generating and charges the org's credits). An image comes back drawn, with its URL and vault id; video is queued and appears in the vault after a few minutes. For video, ground the generation on the tenant's own media: imageAssetId makes that image the opening frame (image-to-video); videoAssetId carries that clip's style and subjects into the new one (reference-to-video — how a tenant keeps a series looking consistent). Video sizes accepted: 1280x720, 720x1280, 1920x1080, 1080x1920 — square is refused.",
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
