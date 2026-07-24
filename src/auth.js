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

// ---------------------------------------------------------------------------
// Cross-tenant access
//
// Every UIIQ API route scopes itself to `session.tenantId`, so a bare MCP call
// can only ever touch the tenant the stored login sits in. Rather than adding a
// tenantId override to those routes (new privileged surface on ~every endpoint),
// tenant-scoped calls ride the operator path the platform already has: start
// impersonation → make the call → exit. That path is SUPER_ADMIN-only, writes an
// ImpersonationLog row per tenant touched, and expires after 30 minutes.
// ---------------------------------------------------------------------------

const IMP_COOKIE_RE = /((?:__Host-)?ubms_impersonate(?:_dev)?=[^;]+)/;

let tenantIndex = null;
let tenantIndexAt = 0;
const TENANT_INDEX_TTL_MS = 5 * 60 * 1000;

function setCookies(res) {
  return typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [res.headers.get("set-cookie") ?? ""];
}

async function resolveTenantId(call, ref) {
  const wanted = String(ref).trim().toLowerCase();
  if (!tenantIndex || Date.now() - tenantIndexAt > TENANT_INDEX_TTL_MS) {
    const res = await call("/admin/tenants");
    if (!res.ok) {
      throw new Error(
        "Could not list tenants — cross-tenant work needs a SUPER_ADMIN login. " + (await res.text()),
      );
    }
    const data = await res.json();
    tenantIndex = Array.isArray(data) ? data : data.tenants ?? [];
    tenantIndexAt = Date.now();
  }
  const hit = tenantIndex.find(
    (t) =>
      String(t.id).toLowerCase() === wanted ||
      String(t.slug ?? "").toLowerCase() === wanted ||
      String(t.name ?? "").toLowerCase() === wanted,
  );
  if (!hit) throw new Error(`Unknown tenant: ${ref} (pass a tenant id, slug or exact name)`);
  return hit.id;
}

// Returns the impersonation cookie to ride along with, or null when the target
// IS the login's own tenant (the platform refuses self-impersonation, and the
// call already lands in the right place without it).
async function beginImpersonation(call, tenantId, writeEnabled) {
  const res = await call("/admin/impersonate", {
    method: "POST",
    body: JSON.stringify({ tenantId, writeEnabled }),
  });
  if (!res.ok) {
    const msg = await res.text();
    if (/own tenant/i.test(msg)) return null;
    throw new Error(`Could not switch to tenant ${tenantId}: ${msg}`);
  }
  for (const raw of setCookies(res)) {
    const m = IMP_COOKIE_RE.exec(raw ?? "");
    if (m) return m[1];
  }
  throw new Error("Tenant switch returned no impersonation cookie — is this login a SUPER_ADMIN?");
}

// The raw session-authenticated caller both apiClient() and withTenant() sit on.
function baseCaller() {
  let creds = loadCreds();
  const base = creds.base ?? BASE;
  // The UIIQ JSON API lives under /api; callers pass bare paths like
  // "/admin/tenants" or "/contacts". (A path already starting with /api is
  // left as-is.)
  const toUrl = (p) => `${base}${p.startsWith("/api") ? p : "/api" + p}`;

  const doFetch = (c, p, init, extraCookies) =>
    fetch(toUrl(p), {
      ...init,
      redirect: "manual",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        Cookie: [
          `${c.cookieName ?? "__Secure-authjs.session-token"}=${c.sessionToken}`,
          ...(extraCookies ?? []),
        ].join("; "),
      },
    });

  return async (p, init = {}, extraCookies) => {
    let res = await doFetch(creds, p, init, extraCookies);
    if (authExpired(res)) {
      creds = await relogin(creds);
      res = await doFetch(creds, p, init, extraCookies);
    }
    return res;
  };
}

/**
 * @param {{ tenant?: string }|string} [options] tenant id, slug or exact name to
 *   act in. Omit to use the tenant the stored login belongs to.
 */
export function apiClient(options = {}) {
  const tenantRef = typeof options === "string" ? options : options.tenant ?? null;
  const call = baseCaller();

  if (!tenantRef) return (p, init = {}) => call(p, init);

  // One impersonation session per call — right for a single tool invocation,
  // wasteful for a batch. Batches use withTenant() instead.
  return async (p, init = {}) => {
    const tenantId = await resolveTenantId(call, tenantRef);
    const writeEnabled = (init.method ?? "GET").toUpperCase() !== "GET";
    const impCookie = await beginImpersonation(call, tenantId, writeEnabled);
    if (!impCookie) return call(p, init);
    try {
      return await call(p, init, [impCookie]);
    } finally {
      // Close the audit log entry. Best-effort — the cookie expires in 30 min
      // regardless, and a failed exit must not mask the caller's result.
      await call("/admin/impersonate/exit", { method: "POST" }, [impCookie]).catch(() => {});
    }
  };
}

/**
 * Run a batch of calls inside ONE tenant session: impersonate once, hand the
 * body a client bound to it, exit once. Seeding 65 cards this way is 67
 * requests and one audit-log row instead of 195 and 65.
 *
 * @param {string|null} tenantRef tenant id, slug or name — null for your own
 * @param {(client: (path: string, init?: object) => Promise<Response>) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
export async function withTenant(tenantRef, fn) {
  const call = baseCaller();
  if (!tenantRef) return fn((p, init = {}) => call(p, init));

  const tenantId = await resolveTenantId(call, tenantRef);
  // Write-enabled: a batch exists to change things, and the session is the
  // operator's own SUPER_ADMIN session either way.
  const impCookie = await beginImpersonation(call, tenantId, true);
  if (!impCookie) return fn((p, init = {}) => call(p, init));
  try {
    return await fn((p, init = {}) => call(p, init, [impCookie]));
  } finally {
    await call("/admin/impersonate/exit", { method: "POST" }, [impCookie]).catch(() => {});
  }
}
