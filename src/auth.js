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

export function apiClient() {
  const creds = loadCreds();
  const cookieName = creds.cookieName ?? "authjs.session-token";
  const cookie = `${cookieName}=${creds.sessionToken}`;
  return (path, init = {}) => {
    const headers = {
      "Content-Type": "application/json",
      Cookie: cookie,
      ...(init.headers ?? {}),
    };
    return fetch(`${BASE}${path}`, { ...init, headers });
  };
}
