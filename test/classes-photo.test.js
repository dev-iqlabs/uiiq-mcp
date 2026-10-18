// node --test — a class's photo (UiiQ-platform class photos, Kim C8: picking or
// replacing one needs photoPermissionConfirmed) through create and update,
// against a local stand-in for UIIQ (a throwaway HOME with a fake session).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, replies, seen, tools;

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, json] = replies.length > 1 ? replies.shift() : replies[0];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(json));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
  mkdirSync(join(home, ".uiiq"));
  writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.UIIQ_BASE = base;
  const { classesTools } = await import("../src/tools/classes.js");
  tools = Object.fromEntries(classesTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, ...responses) {
  replies = responses;
  seen = [];
  const result = await tools[name].handler(args);
  return { result, requests: seen };
}


const CLASS = { name: "Junior Ballet", dayOfWeek: 1, startTime: "17:00", durationMins: 45, capacity: 16 };

test("a photo without photoPermissionConfirmed: true is refused before any request, on create and update", async () => {
  for (const [name, args] of [["uiiq_classes_create", { ...CLASS, imageMediaId: 41 }], ["uiiq_classes_update", { id: "cls_b", ...CLASS, imageMediaId: 42, photoPermissionConfirmed: false }], ["uiiq_classes_update", { id: "cls_b", ...CLASS, imageMediaId: 42, photoPermissionConfirmed: "true" }]]) {
    replies = [[200, { ok: true }]];
    seen = [];
    await assert.rejects(tools[name].handler(args), /public on the internet/);
    assert.deepEqual(seen, [], name);
  }
});

test("with it, imageMediaId and photoPermissionConfirmed are sent", async () => {
  const created = await call("uiiq_classes_create", { ...CLASS, imageMediaId: 41, photoPermissionConfirmed: true }, [201, { ok: true, id: "cls_b" }]);
  assert.deepEqual(created.requests, [{ method: "POST", path: "/classes", body: { ...CLASS, imageMediaId: 41, photoPermissionConfirmed: true } }]);
  const updated = await call("uiiq_classes_update", { id: "cls_b", ...CLASS, imageMediaId: 42, photoPermissionConfirmed: true }, [200, { ok: true }]);
  assert.deepEqual(updated.requests, [{ method: "PATCH", path: "/classes/cls_b", body: { ...CLASS, imageMediaId: 42, photoPermissionConfirmed: true } }]);
});

test("null removes the photo with no confirmation; omitted, nothing about the photo is sent", async () => {
  const removed = await call("uiiq_classes_update", { id: "cls_b", ...CLASS, imageMediaId: null }, [200, { ok: true }]);
  assert.equal(removed.requests[0].body.imageMediaId, null);
  const kept = await call("uiiq_classes_update", { id: "cls_b", ...CLASS }, [200, { ok: true }]);
  assert.equal("imageMediaId" in kept.requests[0].body, false);
});

test("the API's own 400 comes back as the error", async () => {
  replies = [[400, { error: "A class photo is public on the internet, so picking or replacing one needs photoPermissionConfirmed: true" }]];
  seen = [];
  await assert.rejects(tools.uiiq_classes_update.handler({ id: "cls_b", ...CLASS, imageMediaId: 42, photoPermissionConfirmed: true }), /photoPermissionConfirmed: true/);
});

test("both fields are in the create and update schemas", () => {
  for (const name of ["uiiq_classes_create", "uiiq_classes_update"]) {
    const props = tools[name].inputSchema.properties;
    assert.deepEqual(props.imageMediaId.type, ["integer", "null"]);
    assert.equal(props.photoPermissionConfirmed.type, "boolean");
  }
});
