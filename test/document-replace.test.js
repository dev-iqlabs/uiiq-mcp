// node --test — uiiq_document_replace (#995 A7): the document is checked
// first, the bytes go through the presigned upload, and the replace call
// carries the minted key; a wrong id fails before anything is uploaded. Also
// uiiq_classes_policies_set passes a policy's documentId through. Against a
// local stand-in for UIIQ and S3 (a throwaway HOME with a fake session).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, base, seen, tools, classTools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, body });
      const json = (code, v) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(v));
      };
      if (req.url === "/api/documents/doc_1" && req.method === "GET") return json(200, { id: "doc_1", name: "Photo policy" });
      if (req.url.startsWith("/api/documents/") && req.method === "GET") return json(404, { error: "Not found" });
      if (req.url === "/api/upload/document") return json(200, { post: { url: `${base}/s3`, fields: { key: "documents/ten-sbda/new.pdf" } }, key: "documents/ten-sbda/new.pdf" });
      if (req.url === "/s3") {
        res.writeHead(204);
        return res.end();
      }
      if (req.url === "/api/documents/doc_1/replace") return json(200, { id: "doc_1", fileKey: JSON.parse(body).fileKey, revisionId: "rev_1" });
      if (req.url === "/api/classes/parent-policies") return json(200, { ok: true, policies: JSON.parse(body).policies });
      json(500, { error: `unexpected ${req.method} ${req.url}` });
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  writeFileSync(join(home, "policy.pdf"), "%PDF-1.4 test");
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
  const { documentTools } = await import("../src/tools/document.js");
  tools = Object.fromEntries(documentTools.map((t) => [t.name, t]));
  const mod = await import("../src/tools/classes.js");
  const list = Object.values(mod).find((v) => Array.isArray(v) && v.some((t) => t?.name === "uiiq_classes_policies_set"));
  classTools = Object.fromEntries(list.map((t) => [t.name, t]));
});

beforeEach(() => {
  seen = [];
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

test("replace: document checked, bytes uploaded, then the replace carries the minted key", async () => {
  const out = await tools.uiiq_document_replace.handler({ id: "doc_1", path: join(home, "policy.pdf") });
  assert.deepEqual(out, { id: "doc_1", fileKey: "documents/ten-sbda/new.pdf", revisionId: "rev_1" });
  assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ["GET /api/documents/doc_1", "POST /api/upload/document", "POST /s3", "POST /api/documents/doc_1/replace"]);
  assert.deepEqual(JSON.parse(seen[3].body), { fileKey: "documents/ten-sbda/new.pdf", fileType: "pdf", fileSize: 13 });
});

test("replace: keepVersion is sent only when true", async () => {
  await tools.uiiq_document_replace.handler({ id: "doc_1", path: join(home, "policy.pdf"), keepVersion: true });
  assert.deepEqual(JSON.parse(seen[3].body), { fileKey: "documents/ten-sbda/new.pdf", fileType: "pdf", fileSize: 13, keepVersion: true });
});

test("replace: an unknown id fails before anything is uploaded", async () => {
  await assert.rejects(tools.uiiq_document_replace.handler({ id: "nope", path: join(home, "policy.pdf") }), /No document with id nope/);
  assert.deepEqual(seen.map((s) => s.url), ["/api/documents/nope"]);
});

test("policies_set passes documentId through", async () => {
  const policies = [{ key: "photo", title: "Photo consent", version: "2", documentId: "doc_1" }];
  await classTools.uiiq_classes_policies_set.handler({ policies });
  assert.deepEqual(JSON.parse(seen[0].body), { policies });
  assert.ok(classTools.uiiq_classes_policies_set.inputSchema.properties.policies.items.properties.documentId);
});

test("policies_set sends revision and reuseVersion only when given, and its schema is closed", async () => {
  const policies = [{ key: "photo", title: "Photo consent", version: "2" }];
  await classTools.uiiq_classes_policies_set.handler({ policies, revision: "abc", reuseVersion: true });
  assert.deepEqual(JSON.parse(seen[0].body), { policies, revision: "abc", reuseVersion: true });
  await classTools.uiiq_classes_policies_set.handler({ policies, reuseVersion: false });
  assert.deepEqual(JSON.parse(seen[1].body), { policies });
  assert.equal(classTools.uiiq_classes_policies_set.inputSchema.additionalProperties, false);
});
