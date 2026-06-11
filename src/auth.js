import fs from "fs";
import os from "os";
import path from "path";
import { BASE } from "./config.js";

const CREDS_PATH = path.join(os.homedir(), ".uiiq", "credentials.json");

function loadCreds() {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error("Not logged in. Run: uiiq login");
  }
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8"));
}

function saveCreds(data) {
  fs.mkdirSync(path.dirname(CREDS_PATH), { recursive: true });
  fs.writeFileSync(CREDS_PATH, JSON.stringify(data, null, 2));
  try { fs.chmodSync(CREDS_PATH, 0o600); } catch { /* best effort */ }
}

// A response is "auth expired" when the NextAuth middleware bounces an API call
// to the login page (307 → /login) or returns 401 / an HTML page instead of JSON.
function authExpired(res) {
  if (res.status === 401) return true;
  if (res.status >= 300 && res.status < 400) {
    return (res.headers.get("location") ?? "").includes("/login");
  }
  return (res.headers.get("content-type") ?? "").includes("text/html");
}

// Re-authenticate via the NextAuth credentials provider using the email +
// password saved by `uiiq login`. Refreshes the session cookie in place so the
// MCP never needs a manual re-login (rotate the stored password as needed).
async function relogin(creds) {
  const base = creds.base ?? BASE;
  if (!creds.email || !creds.password) {
    throw new Error(
      "UIIQ session expired and no stored password to auto-relogin. Run: uiiq login"
    );
  }
  const csrfRes = await fetch(`${base}/api/auth/csrf`);
  if (!csrfRes.ok) throw new Error(`Could not reach ${base} for re-login`);
  const { csrfToken } = await csrfRes.json();
  const csrfCookie = csrfRes.headers.get("set-cookie") ?? "";

  const body = new URLSearchParams({
    csrfToken,
    email: creds.email,
    password: creds.password,
    redirect: "false",
    json: "true",
  });
  const res = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: csrfCookie },
    body: body.toString(),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie") ?? "";
  const m = setCookie.match(/(?:__Secure-authjs\.session-token|authjs\.session-token)=([^;]+)/);
  if (!m) throw new Error("Auto-relogin failed — check stored credentials or run: uiiq login");

  const updated = {
    ...creds,
    sessionToken: m[1],
    cookieName: setCookie.includes("__Secure-")
      ? "__Secure-authjs.session-token"
      : "authjs.session-token",
    savedAt: new Date().toISOString(),
  };
  saveCreds(updated);
  return updated;
}

export function apiClient() {
  let creds = loadCreds();
  const base = creds.base ?? BASE;
  // The UIIQ JSON API lives under /api; callers pass bare paths like
  // "/admin/tenants" or "/contacts". (A path already starting with /api is
  // left as-is.)
  const toUrl = (p) => `${base}${p.startsWith("/api") ? p : "/api" + p}`;

  const doFetch = (c, p, init) =>
    fetch(toUrl(p), {
      ...init,
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${c.cookieName ?? "__Secure-authjs.session-token"}=${c.sessionToken}`,
        ...(init.headers ?? {}),
      },
    });

  return async (p, init = {}) => {
    let res = await doFetch(creds, p, init);
    if (authExpired(res)) {
      creds = await relogin(creds);
      res = await doFetch(creds, p, init);
    }
    return res;
  };
}
