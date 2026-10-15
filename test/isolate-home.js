// Imported FIRST by a test file whose tools would otherwise read the real
// ~/.uiiq/credentials.json and send to app.uiiq.co.uk (Lucas, uiiq-mcp #97).
// It gives the file a throwaway HOME with a fake session, and points UIIQ_BASE
// at a port nothing listens on, so a request that slips past a dry run fails
// instead of reaching UIIQ. auth.js and config.js read HOME and UIIQ_BASE when
// they load, which is why this must come before any ../src import. node --test
// runs each file in its own process, so this holds for that file only.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const home = mkdtempSync(join(tmpdir(), "uiiq-mcp-test-home-"));
export const base = "http://127.0.0.1:9";

mkdirSync(join(home, ".uiiq"));
writeFileSync(join(home, ".uiiq", "credentials.json"), JSON.stringify({ base, sessionToken: "test", cookieName: "authjs.session-token" }));
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.UIIQ_BASE = base;
delete process.env.UIIQ_MCP_INHERIT_IMPERSONATION;
delete process.env.UIIQ_MCP_INHERIT_WRITE;
process.on("exit", () => rmSync(home, { recursive: true, force: true }));
