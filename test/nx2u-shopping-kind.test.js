// node --test — the NX2U event tools offer the SHOPPING kind (UiiQ step 2,
// BRIEF-uiiq-nx2u-shopping-player s.1) and say it is never PIN, so an agent
// does not try a PIN shopping show and get UiiQ's SHOPPING_REFUSES_PIN.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nx2uTools } from "../src/tools/nx2u.js";

const tool = (name) => nx2uTools.find((t) => t.name === name);

test("event create and update accept the SHOPPING kind", () => {
  for (const name of ["uiiq_nx2u_event_create", "uiiq_nx2u_event_update"]) {
    assert.ok(tool(name).inputSchema.properties.kind.enum.includes("SHOPPING"), name);
  }
});

test("both descriptions say a SHOPPING event is never PIN", () => {
  assert.match(tool("uiiq_nx2u_event_create").description, /SHOPPING event[^.]*PUBLIC or UNLISTED, never PIN/);
  assert.match(tool("uiiq_nx2u_event_update").description, /SHOPPING event never becomes PIN/);
});
