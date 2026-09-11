# Brief — MCP: write access to the Document Vault

**Owner: the UiiQ session.** MCP-only — no platform change needed, no IQEX involvement.
Smallest of the three open briefs and the quickest win.

**Repo:** `uiiq-mcp` (v2.19.0) · **File:** `src/tools/document.js`
**Raised:** 2026-09-05, during Milestone Ranch events work
**Size:** small — MCP-only. **No UIIQ platform changes are needed.**

## Why

The vault is read-only from the MCP. `documentTools` exposes `uiiq_document_list` and
`uiiq_document_get` and nothing else, so anything that needs a file *put into* the vault
stops and becomes a manual upload through the UIIQ UI.

This surfaced when Milestone asked to keep their party-invite artwork "in the vault for
future use". The fallback was the WordPress media library — a public bucket on the
customer's own website, which is the wrong home for internal design assets.

The same gap already cost us on the Sell side (see
`project_uiiq_mcp_missing_sell_write_tools`); `uiiq_sell_experience_create/update` closed
that one. This is the document equivalent.

## What already exists (don't rebuild it)

The platform side is complete. The vault upload is a three-step presigned-POST flow and
every piece is live:

| Step | Endpoint | Notes |
|---|---|---|
| 1. Mint a key + presigned POST | `POST /api/upload/document` | Body `{fileName, contentType, fileSize}` → `{post: {url, fields}, key}`. Key is minted server-side as `documents/<tenantId>/<uid>.<ext>` |
| 2. Upload the bytes | `POST` to `post.url` | Multipart form: all of `post.fields`, then `file` last. Straight to S3, not through UIIQ |
| 3. Register the row | `POST /api/documents` | Body `{name, description, fileKey, fileType, fileSize, category}` → 201 with the `Document` |

Also live: `DELETE /api/documents/[id]` (deletes the row *and* best-effort purges the S3
object) and `GET /api/documents/[id]/download` (302 to a ~120s signed URL).

Files go to the **private** bucket. There is no public URL, by design — the vault holds
legal documents, contracts and scans. If `PRIVATE_DOCS_BUCKET` is unset, step 1 fails
closed with 503 rather than falling back to public.

## Tools to add

### 1. `uiiq_document_create` — the main one

Orchestrates all three steps so the caller sees one operation.

```
path?        Local file path. One of path or url required.
url?         http(s) URL to fetch and upload. One of path or url required.
name?        Display name. Defaults to the file name.
description? Free text.
category?    'legal' | 'correspondence' | 'scan' | … (free string)
tenant?      Standard TENANT_PROP
```

Returns the created `Document`.

**Model it on `uiiq_media_upload`** in `src/tools/media.js` — same `path` XOR `url`
handling, same MIME-by-extension map, same "fetch the URL and check content-type"
branch. The difference is the destination and the three-step flow; the input ergonomics
should feel identical.

Two things `media.js` does that this must not copy blindly:
- The `multipart()` helper there exists because `apiClient` forces
  `Content-Type: application/json`. **Step 2 does not go through `apiClient` at all** —
  it's a direct `fetch` to S3 with no UIIQ auth. Steps 1 and 3 are plain JSON through
  `apiClient` as normal.
- Field order in the S3 form matters: every entry of `post.fields` first, `file` last.
  S3 ignores anything after the file part.

### 2. `uiiq_document_delete`

`id` + `tenant` → `DELETE /api/documents/{id}`. Destructive and it purges the S3 object,
so say so plainly in the tool description.

### 3. `uiiq_document_download`

`id` + optional `outPath` + `tenant`. Follows the 302 and writes the file locally,
returning the path. Without this, a document in the vault can be listed but never read
back — which is half the value of putting it there.

## Constraints to enforce client-side

Fail fast in the tool rather than round-tripping to get a 400:

- **10 MB max** (`MAX_SIZE` in `upload/document/route.ts`).
- **Allowed MIME types:** PDF, Word (.doc/.docx), Excel (.xls/.xlsx), `text/plain`,
  `text/markdown`, `text/csv`, JPEG, PNG, WebP. Note this list differs from the media
  vault's — no GIF, no video, but it does take documents and CSV.
- **Never forge `fileKey`.** Always use the key returned by step 1. `POST /api/documents`
  rejects any key outside the caller's `documents/<tenantId>/` prefix — a deliberate guard
  against binding another tenant's private object to your own record. Don't work around it.

## Two bugs to fix while in here

Both are live in `src/tools/document.js` today:

1. **`uiiq_document_get` cannot work.** It calls `GET /documents/{id}`, but
   `apps/uiiq/src/app/api/documents/[id]/route.ts` only exports `DELETE`. There is no GET
   handler, so this returns 405 for every id. Either add a GET to the platform route or
   have the tool filter the list endpoint. (Worth confirming against deployed rather than
   my local checkout, which is a few weeks behind.)

2. **`uiiq_document_list`'s `search` is silently ignored.** The tool sends `?search=`,
   but `GET /api/documents` only reads `category`. Either add `search` server-side (name /
   description contains) or swap the tool's parameter to `category`, which is what the
   endpoint actually supports. Right now it looks like it filters and doesn't.

## CLI parity

`UiiQ-cli` `src/commands/document.js` has the same read-only shape (`list`, `get`). Add
`document add`, `document rm` and `document download` alongside, matching whatever the MCP
lands on. The MCP and CLI have drifted before — the CLI still has no experience
create/update months after the MCP got them.

## Acceptance

- Upload a local PDF and a PNG-from-URL into Milestone's vault; both appear in
  `uiiq_document_list` with correct `fileType`, `fileSize` and `category`.
- `fileKey` is set and `fileUrl` is null (proves it went to the private bucket).
- `uiiq_document_download` returns a readable file matching the original bytes.
- An 11 MB file and a `.zip` are both rejected client-side with a clear message, without
  hitting the API.
- A cross-tenant `fileKey` is impossible to submit.
- `uiiq_document_get` returns a document; `list` with a filter actually filters.

## Out of scope

Versioning, folders, sharing links, and OCR/extraction. The vault is a flat per-tenant
list today and this brief keeps it that way.
