// node --test — the live show planner's tools (UiiQ NX2U plan step 3): each is there, calls its UiiQ route with
// the method the route takes, and sends only what it should. The routes are checked by UiiQ's
// scripts/client-coverage.mjs, which scans this source for the paths.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nx2uTools } from "../src/tools/nx2u.js";

const src = readFileSync(new URL("../src/tools/nx2u.js", import.meta.url), "utf8");
const tool = (name) => {
  const t = nx2uTools.find((x) => x.name === name);
  assert.ok(t, `${name} is missing`);
  return t;
};

test("every show tool is there, with its route", () => {
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
    tool(name);
    assert.ok(src.includes(path), `${name}: ${path}`);
  }
});

test("create says an UNLISTED event needs the acknowledgement, and nothing is published", () => {
  const t = tool("uiiq_nx2u_show_create");
  assert.deepEqual(t.inputSchema.required, ["siteId", "title", "start", "youtube", "products"]);
  assert.ok("acknowledgeUnlisted" in t.inputSchema.properties);
  assert.match(t.description, /UNLISTED[\s\S]*acknowledgeUnlisted/);
  assert.match(t.description, /DRAFT Socials post/);
  assert.match(t.description, /nothing is published/);
  assert.ok(!("tenantId" in t.inputSchema.properties));
});

test("control sends only the state and product given, and marks itself as the API", async () => {
  const t = tool("uiiq_nx2u_show_control");
  assert.deepEqual(t.inputSchema.properties.state.enum, ["scheduled", "live", "ended"]);
  assert.match(src, /JSON\.stringify\(\{ \.\.\.body, via: "api" \}\)/);
});

test("the post tool never publishes or schedules", () => {
  assert.match(tool("uiiq_nx2u_show_post_draft").description, /Never publishes or schedules/);
  assert.doesNotMatch(src.slice(src.indexOf("uiiq_nx2u_show_list")), /\/socials\/posts|\/publish/);
});
