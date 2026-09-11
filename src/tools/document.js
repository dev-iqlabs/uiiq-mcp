import { readFile, writeFile, mkdir } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { apiClient } from "../auth.js";

// The tenant's Document Vault: contracts, scans, legal letters, the finance
// reference library. Files live in the PRIVATE bucket and there is no public
// URL by design; reading one back means asking the platform for a short-lived
// signed link. Uploading is a three-step flow the platform already exposes —
// mint a key and a presigned POST, put the bytes straight to S3, register the
// row — and `uiiq_document_create` does all three so the caller sees one
// operation.
const TENANT_PROP = {
  type: "string",
  description: "Tenant id, slug or exact name to act in. Omit for your own tenant.",
};
const api = (tenant) => apiClient(tenant ? { tenant } : {});

/** What the vault accepts — the platform's list, mirrored so a bad file fails here, not after a round trip. */
const MIME_BY_EXT = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
  csv: "text/csv",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT).concat(["text/x-markdown"]));
const MAX_BYTES = 10 * 1024 * 1024;

/** 'pdf' | 'image' | 'document' | … — the coarse type the vault UI groups by. */
function fileTypeOf(mime) {
  if (mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime === "text/csv") return "csv";
  if (mime.startsWith("text/")) return "text";
  if (mime.includes("spreadsheet") || mime === "application/vnd.ms-excel") return "spreadsheet";
  return "document";
}

/**
 * Bytes from a local path or a URL, with the type checked before anything is
 * sent. Same ergonomics as uiiq_media_upload; different allowlist.
 */
async function loadFile({ path, url }) {
  if (!path && !url) throw new Error("Provide a local `path` or a `url`.");
  if (path && url) throw new Error("Provide `path` or `url`, not both.");

  let bytes, filename, mime;
  if (path) {
    filename = basename(path);
    mime = MIME_BY_EXT[extname(filename).slice(1).toLowerCase()];
    if (!mime) throw new Error(`Unsupported file type: ${filename} — the vault takes PDF, Word, Excel, TXT, MD, CSV, JPEG, PNG or WebP.`);
    bytes = await readFile(path);
  } else {
    if (!/^https?:\/\//i.test(url)) throw new Error("URL must be http(s).");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not fetch ${url}: HTTP ${res.status}`);
    mime = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (mime === "text/x-markdown") mime = "text/markdown";
    if (!ALLOWED_MIME.has(mime)) {
      throw new Error(`Unsupported content type from URL: ${mime || "unknown"} — the vault takes PDF, Word, Excel, TXT, MD, CSV, JPEG, PNG or WebP.`);
    }
    bytes = Buffer.from(await res.arrayBuffer());
    filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || "download");
  }

  if (bytes.length === 0) throw new Error("That file is empty.");
  if (bytes.length > MAX_BYTES) {
    throw new Error(`${filename} is ${(bytes.length / 1048576).toFixed(1)} MB — the vault's limit is 10 MB.`);
  }
  return { bytes, filename, mime };
}

export const documentTools = [
  {
    name: "uiiq_document_list",
    description:
      "List documents in the tenant's vault, newest first (up to 100). `search` matches name or description; `category` matches exactly (e.g. 'legal', 'correspondence', 'scan').",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Name or description contains this, case-insensitive." },
        category: { type: "string", description: "Exact category to filter by." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ search, category, tenant } = {}) {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      if (category) qs.set("category", category);
      const res = await api(tenant)(`/documents${qs.size ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_document_get",
    description: "One vault document's record by id: name, description, category, type, size, date. The file itself comes from uiiq_document_download.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/documents/${encodeURIComponent(id)}`);
      if (res.status === 404) throw new Error(`No document with id ${id} in this vault.`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_document_create",
    description:
      "Put a file into the tenant's Document Vault from a local path or a URL, and register it. Private storage — there is no public link; read it back with uiiq_document_download. " +
      "Takes PDF, Word, Excel, TXT, Markdown, CSV, JPEG, PNG or WebP, up to 10 MB. Returns the created document.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Local file path. One of path or url is required." },
        url: { type: "string", description: "http(s) URL to fetch and store. One of path or url is required." },
        name: { type: "string", description: "Display name. Defaults to the file name without its extension." },
        description: { type: "string" },
        category: { type: "string", description: "e.g. 'legal', 'correspondence', 'scan', 'artwork'. Free text." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ path, url, name, description, category, tenant } = {}) {
      const { bytes, filename, mime } = await loadFile({ path, url });
      const client = api(tenant);

      // 1. A key and a presigned POST. The key is minted server-side inside
      //    this tenant's prefix; the register step refuses anything else, so
      //    it is never invented here.
      const presign = await client("/upload/document", {
        method: "POST",
        body: JSON.stringify({ fileName: filename, contentType: mime, fileSize: bytes.length }),
      });
      if (!presign.ok) throw new Error(await presign.text());
      const { post, key } = await presign.json();

      // 2. The bytes, straight to S3. Not through the platform, no auth: the
      //    presigned fields ARE the authorisation. Every field first, `file`
      //    last — S3 ignores anything after the file part.
      const form = new FormData();
      for (const [k, v] of Object.entries(post.fields)) form.append(k, v);
      form.append("file", new Blob([bytes], { type: mime }), filename);
      const s3 = await fetch(post.url, { method: "POST", body: form });
      if (!s3.ok) throw new Error(`Storage refused the upload: HTTP ${s3.status} ${(await s3.text()).slice(0, 200)}`);

      // 3. The row.
      const res = await client("/documents", {
        method: "POST",
        body: JSON.stringify({
          name: name?.trim() || filename.replace(/\.[^.]+$/, ""),
          description: description || undefined,
          fileKey: key,
          fileType: fileTypeOf(mime),
          fileSize: bytes.length,
          category: category || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_document_download",
    description:
      "Fetch a vault document's file to a local path and return that path. The platform issues a signed link that lasts about two minutes; this follows it once. Default location: the current directory, named as in the vault.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        outPath: { type: "string", description: "Where to write the file. Defaults to ./<name>.<ext>." },
        tenant: TENANT_PROP,
      },
    },
    async handler({ id, outPath, tenant }) {
      const client = api(tenant);
      const meta = await client(`/documents/${encodeURIComponent(id)}`);
      if (meta.status === 404) throw new Error(`No document with id ${id} in this vault.`);
      if (!meta.ok) throw new Error(await meta.text());
      const doc = await meta.json();

      // The caller is built with redirect: "manual", which is right — a
      // session cookie must never ride along to S3. Take the Location and
      // fetch it plain.
      const hop = await client(`/documents/${encodeURIComponent(id)}/download`);
      const location = hop.headers.get("location");
      if (!location) throw new Error(hop.ok ? "The platform returned no download link." : await hop.text());
      const file = await fetch(location);
      if (!file.ok) throw new Error(`Storage refused the download: HTTP ${file.status}`);
      const bytes = Buffer.from(await file.arrayBuffer());

      const ext = doc.fileKey ? extname(doc.fileKey) : extname(new URL(location).pathname);
      const target = outPath || join(process.cwd(), `${(doc.name || id).replace(/[\\/:*?"<>|]+/g, "_")}${ext}`);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return { path: target, bytes: bytes.length, name: doc.name, fileType: doc.fileType };
    },
  },
  {
    name: "uiiq_document_delete",
    description:
      "Delete a vault document permanently. Removes the record AND the stored file — there is no undo and no recycle bin.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" }, tenant: TENANT_PROP } },
    async handler({ id, tenant }) {
      const res = await api(tenant)(`/documents/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (res.status === 404) throw new Error(`No document with id ${id} in this vault.`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
];
