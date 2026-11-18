// node --test — the live show planner's tools (UiiQ NX2U plan step 3), against a local stand-in for UIIQ (a
// throwaway HOME with a fake session, so no real login is read or sent). Each calls its route with the method it
// takes; cancelling, and going live or ending, need confirm: true or are a dry run that changes nothing (Lucas
// R160-04); an Unlisted event's "I understand" is never sent from here, even if an agent adds it. The routes are
// checked by UiiQ's scripts/client-coverage.mjs, which scans this source for the paths.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let server, home, reply, seen, tools;
const SHOW = { id: "show1", title: "Friday coin show", start: "2026-11-20T15:00:00.000Z", state: "scheduled", shop: { liveUrl: "https://ultimatecoins.co.uk/live/" } };

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, path: req.url.replace(/^\/api/, ""), ...(body ? { body: JSON.parse(body) } : {}) });
      const [status, data] = reply;
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(data));
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
  delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
  const { nx2uTools } = await import("../src/tools/nx2u.js");
  tools = Object.fromEntries(nx2uTools.map((t) => [t.name, t]));
});

after(async () => {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  rmSync(home, { recursive: true, force: true });
});

async function call(name, args, response = [200, {}]) {
  reply = response;
  seen = [];
  try {
    return { result: await tools[name].handler(args), requests: seen };
  } catch (error) {
    return { error, requests: seen };
  }
}

test("every show tool is there, with its route in the source", () => {
  const src = readFileSync(new URL("../src/tools/nx2u.js", import.meta.url), "utf8");
  for (const [name, path] of [
    ["uiiq_nx2u_show_list", "`/nx2u/shows${s ? `?${s}` : \"\"}`"],
    ["uiiq_nx2u_show_get", "`/nx2u/shows/${encodeURIComponent(id)}`"],
    ["uiiq_nx2u_show_create", "\"/nx2u/shows\", { method: \"POST\""],
    ["uiiq_nx2u_show_update", "`/nx2u/shows/${encodeURIComponent(id)}`, { method: \"PATCH\""],
    ["uiiq_nx2u_show_cancel", "`/nx2u/shows/${encodeURIComponent(id)}/cancel`, { method: \"POST\" }"],
    ["uiiq_nx2u_show_control", "`/nx2u/shows/${encodeURIComponent(id)}/control`, { method: \"POST\""],
    ["uiiq_nx2u_show_report", "`/nx2u/shows/${encodeURIComponent(id)}/report`"],
    ["uiiq_nx2u_show_post_draft", "`/nx2u/shows/${encodeURIComponent(id)}/post`, { method: \"POST\" }"],
  ]) {
    assert.ok(tools[name], `${name} is missing`);
    assert.ok(src.includes(path), `${name}: ${path}`);
  }
});

test("cancel without confirm is a dry run: it reads the show and changes nothing", async () => {
  for (const confirm of [undefined, false, "yes", 1]) {
    const r = await call("uiiq_nx2u_show_cancel", { id: "show1", confirm }, [200, { show: SHOW }]);
    assert.equal(r.result.dryRun, true);
    assert.match(r.result.message, /Nothing was changed.*cancelled.*for good/);
    assert.deepEqual(r.requests.map((x) => [x.method, x.path]), [["GET", "/nx2u/shows/show1"]]);
  }
  const done = await call("uiiq_nx2u_show_cancel", { id: "show1", confirm: true }, [200, { show: SHOW, post: null }]);
  assert.deepEqual(done.requests.map((x) => [x.method, x.path]), [["POST", "/nx2u/shows/show1/cancel"]]);
});

test("control: a state change needs confirm; the product on screen alone doesn't", async () => {
  for (const state of ["live", "ended", "scheduled"]) {
    const r = await call("uiiq_nx2u_show_control", { id: "show1", state }, [200, { show: SHOW }]);
    assert.equal(r.result.dryRun, true, state);
    assert.deepEqual(r.requests.map((x) => x.method), ["GET"], state);
  }
  const both = await call("uiiq_nx2u_show_control", { id: "show1", state: "live", productId: 12 }, [200, { show: SHOW }]);
  assert.equal(both.result.dryRun, true);
  assert.equal(both.requests.length, 1);
  const product = await call("uiiq_nx2u_show_control", { id: "show1", productId: 12 }, [200, { show: SHOW }]);
  assert.deepEqual(product.requests, [{ method: "POST", path: "/nx2u/shows/show1/control", body: { productId: 12, via: "api" } }]);
  const live = await call("uiiq_nx2u_show_control", { id: "show1", state: "live", confirm: true }, [200, { show: SHOW }]);
  assert.deepEqual(live.requests, [{ method: "POST", path: "/nx2u/shows/show1/control", body: { state: "live", via: "api" } }]);
});

test("the Unlisted acknowledgement is not in the schema and never sent, even if an agent adds it", async () => {
  for (const name of ["uiiq_nx2u_show_create", "uiiq_nx2u_show_update"]) {
    assert.equal("acknowledgeUnlisted" in tools[name].inputSchema.properties, false, name);
    assert.match(tools[name].description, /UNLISTED[\s\S]*a person accepts that in the planner[\s\S]*can't accept it/);
  }
  const c = await call("uiiq_nx2u_show_create", { siteId: "site1", title: "T", start: "2026-11-20T15:00:00Z", youtube: "https://youtu.be/dQw4w9WgXcQ", products: [12], nx2uEventId: "e2", acknowledgeUnlisted: true }, [201, { show: SHOW }]);
  assert.equal("acknowledgeUnlisted" in c.requests[0].body, false);
  const u = await call("uiiq_nx2u_show_update", { id: "show1", title: "T", acknowledgeUnlisted: true }, [200, { show: SHOW }]);
  assert.deepEqual(u.requests[0].body, { title: "T" });
});

test("UiiQ's Unlisted refusal says a person must accept it in the planner or the CLI", async () => {
  const r = await call("uiiq_nx2u_show_update", { id: "show1", nx2uEventId: "e2" }, [409, { error: "This NX2U event is Unlisted…", code: "NX2U_UNLISTED_ACK_REQUIRED" }]);
  assert.match(r.error.message, /This NX2U event is Unlisted… This tool can't accept it: .*Live shows.*--i-understand/);
});

test("create needs the shop, title, start, video and products, and names no workspace", () => {
  assert.deepEqual(tools.uiiq_nx2u_show_create.inputSchema.required, ["siteId", "title", "start", "youtube", "products"]);
  assert.ok(!("tenantId" in tools.uiiq_nx2u_show_create.inputSchema.properties));
  assert.match(tools.uiiq_nx2u_show_create.description, /DRAFT Socials post[\s\S]*nothing is published/);
  assert.match(tools.uiiq_nx2u_show_post_draft.description, /Never publishes or schedules/);
  assert.match(tools.uiiq_nx2u_show_report.description, /Online orders read/);
});
