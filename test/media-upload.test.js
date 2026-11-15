// node --test — uiiq_media_upload and the shared caller's failed answers.
// An 8 MB mp4 gave an EMPTY error: UiiQ's upload goes through its hosting,
// which refuses about 4.4 MB and up before UiiQ's route runs, with no body,
// and the tool threw that body. Now a file over 4 MB isn't sent, a failed
// answer with no body says its status (every tool, through the shared caller),
// and a Git Bash /c/… path is read on Windows. Against a local stand-in for
// UIIQ (a throwaway HOME with a fake session).
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, base, seen, reply, tools, media;
const BIG = () => media.MAX_UPLOAD_BYTES + 1;

before(async () => {
  server = http.createServer((req, res) => {
    let size = 0;
    req.on("data", (c) => (size += c.length));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, size });
      if (req.url === "/big.mp4") {
        res.writeHead(200, { "content-type": "video/mp4", "content-length": String(BIG()) });
        return res.end(Buffer.alloc(BIG()));
      }
      if (req.url === "/big-chunked.mp4") {
        res.writeHead(200, { "content-type": "video/mp4" });
        res.write(Buffer.alloc(media.MAX_UPLOAD_BYTES));
        return res.end(Buffer.alloc(1));
      }
      const [status, body] = reply;
      if (body === undefined) {
        res.writeHead(status);
        return res.end();
      }
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
  media = await import("../src/tools/media.js");
  tools = Object.fromEntries(media.mediaTools.map((t) => [t.name, t]));
  writeFileSync(join(home, "big.mp4"), Buffer.alloc(BIG()));
  writeFileSync(join(home, "four.mp4"), Buffer.alloc(media.MAX_UPLOAD_BYTES));
  writeFileSync(join(home, "small.png"), Buffer.from("png"));
});

beforeEach(() => {
  seen = [];
  reply = [200, { id: 7, name: "small.png" }];
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

const uploads = () => seen.filter((s) => s.url === "/api/assets/upload");

test("the limit is 4 MB: under the hosting's ~4.4 MB of file", () => {
  assert.equal(media.MAX_UPLOAD_BYTES, 4 * 1024 * 1024);
});

test("a file over 4 MB is refused before anything is sent, saying why and what to do instead", async () => {
  await assert.rejects(tools.uiiq_media_upload.handler({ path: join(home, "big.mp4") }), (e) => {
    assert.match(e.message, /^big\.mp4 is 4\.0 MB, over the 4 MB the Media Vault upload takes\./);
    assert.match(e.message, /refuses a request over about 4\.4 MB of file before UiiQ sees it, with no message, so it wasn't sent/);
    assert.match(e.message, /Make it smaller than 4 MB/);
    assert.match(e.message, /uiiq_media_presign/);
    return true;
  });
  assert.deepEqual(seen, []);
});

test("a file of exactly 4 MB is sent", async () => {
  const out = await tools.uiiq_media_upload.handler({ path: join(home, "four.mp4") });
  assert.deepEqual(out, { id: 7, name: "small.png" });
  assert.equal(uploads().length, 1);
  assert.ok(uploads()[0].size > media.MAX_UPLOAD_BYTES, "the whole file went");
});

test("a URL over 4 MB is refused before the upload: by its declared length, or by what came", async () => {
  await assert.rejects(tools.uiiq_media_upload.handler({ url: `${base}/big.mp4` }), /^Error: big\.mp4 is 4\.0 MB, over the 4 MB/);
  await assert.rejects(tools.uiiq_media_upload.handler({ url: `${base}/big-chunked.mp4` }), /^Error: big-chunked\.mp4 is 4\.0 MB, over the 4 MB/);
  assert.deepEqual(uploads(), []);
});

test("an upload answered with no body says its status and what it almost always means", async () => {
  reply = [413];
  await assert.rejects(tools.uiiq_media_upload.handler({ path: join(home, "small.png") }), (e) => {
    assert.match(e.message, /^413 Payload Too Large, with no body\. Probably the hosting refusing a file over UiiQ's upload size \(about 4\.4 MB\)/);
    assert.match(e.message, /uiiq_media_presign/);
    return true;
  });
  reply = [502];
  await assert.rejects(tools.uiiq_media_upload.handler({ path: join(home, "small.png") }), /^Error: 502 Bad Gateway, with no body\./);
});

test("an upload UiiQ refuses in words keeps them, with the status", async () => {
  reply = [400, { error: "No file" }];
  await assert.rejects(tools.uiiq_media_upload.handler({ path: join(home, "small.png") }), (e) => {
    assert.equal(e.message, '400 Bad Request: {"error":"No file"}');
    return true;
  });
});

test("every tool: a failed answer with no body gives its status, never an empty error", async () => {
  reply = [502];
  await assert.rejects(tools.uiiq_media_list.handler({}), (e) => {
    assert.equal(e.message, "HTTP 502 Bad Gateway, with no body");
    return true;
  });
  reply = [404];
  await assert.rejects(tools.uiiq_media_delete.handler({ assetId: 5 }), (e) => {
    assert.equal(e.message, "HTTP 404 Not Found, with no body");
    return true;
  });
  reply = [403, { error: "Forbidden" }];
  await assert.rejects(tools.uiiq_media_list.handler({}), (e) => {
    assert.equal(e.message, '{"error":"Forbidden"}');
    return true;
  });
});

test("a Git Bash path becomes a Windows one on Windows only", () => {
  assert.equal(media.localPath("/c/Users/STEPHE~1/clip.mp4", "win32"), "C:\\Users\\STEPHE~1\\clip.mp4");
  assert.equal(media.localPath("/d/CODE_REPO/a b/x.png", "win32"), "D:\\CODE_REPO\\a b\\x.png");
  assert.equal(media.localPath("/c", "win32"), "C:\\");
  assert.equal(media.localPath("/c/", "win32"), "C:\\");
  for (const kept of ["C:\\Users\\x.mp4", "C:/Users/x.mp4", "/tmp/x.mp4", "relative/x.mp4", "\\\\server\\share\\x.mp4"]) {
    assert.equal(media.localPath(kept, "win32"), kept);
  }
  assert.equal(media.localPath("/c/Users/x.mp4", "linux"), "/c/Users/x.mp4");
  assert.equal(media.localPath(undefined, "win32"), undefined);
});

test("upload and presign read a Git Bash path on this Windows machine", { skip: process.platform !== "win32" }, async () => {
  const gitBash = join(home, "small.png").replace(/^([A-Za-z]):\\/, (_, d) => `/${d.toLowerCase()}/`).replace(/\\/g, "/");
  assert.match(gitBash, /^\/[a-z]\//);
  const out = await tools.uiiq_media_upload.handler({ path: gitBash });
  assert.equal(out.id, 7);
  assert.equal(uploads().length, 1);

  seen = [];
  reply = [200, { url: `${base}/s3`, fields: { key: "uploads/small.png" }, fileUrl: "https://cdn/small.png", key: "uploads/small.png" }];
  const pre = await tools.uiiq_media_presign.handler({ path: gitBash });
  assert.deepEqual(pre, { uploaded: true, fileUrl: "https://cdn/small.png", key: "uploads/small.png" });
  assert.deepEqual(seen.map((s) => `${s.method} ${s.url}`), ["POST /api/upload/presign", "POST /s3"]);
});
