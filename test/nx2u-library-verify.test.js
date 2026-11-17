// node --test — uiiq_nx2u_library_verify exists, takes only a tenant, and says
// what it is for (UiiQ R150-01: PIN and UNLISTED play only once the library is
// seen ENFORCING token auth). The route it calls is checked by UiiQ's
// scripts/client-coverage.mjs, which scans this source for the path.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { nx2uTools } from "../src/tools/nx2u.js";

test("the verify tool is there, needs nothing but an optional tenant, and posts to /nx2u/library/verify", () => {
  const t = nx2uTools.find((x) => x.name === "uiiq_nx2u_library_verify");
  assert.ok(t);
  assert.deepEqual(Object.keys(t.inputSchema.properties), ["tenant"]);
  assert.equal(t.inputSchema.required, undefined);
  assert.match(t.description, /ENFORCES token authentication/);
  assert.match(readFileSync(new URL("../src/tools/nx2u.js", import.meta.url), "utf8"), /"\/nx2u\/library\/verify", \{ method: "POST" \}/);
});
