import { BASE } from "../config.js";

/**
 * Till is device-authed (cookie uiiq_till_device), not the NextAuth session the
 * other tools use. Provide the device token via env UIIQ_TILL_DEVICE_TOKEN
 * (obtain it by pairing a device — e.g. `uiiq till connect` in the CLI).
 * Read-only ("T1") tools only; sales need a staff-PIN session ("T2").
 */
const DEVICE_COOKIE = "uiiq_till_device";

function tillClient() {
  const token = process.env.UIIQ_TILL_DEVICE_TOKEN;
  if (!token) {
    throw new Error(
      "No till device token. Set UIIQ_TILL_DEVICE_TOKEN (pair a device, e.g. `uiiq till connect`).",
    );
  }
  return (path, init = {}) =>
    fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Cookie: `${DEVICE_COOKIE}=${encodeURIComponent(token)}`,
        ...(init.headers ?? {}),
      },
    });
}

export const tillTools = [
  {
    name: "uiiq_till_catalog",
    description: "List the till catalog (device-scoped). Requires UIIQ_TILL_DEVICE_TOKEN.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await tillClient()("/till/catalog");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  },
  {
    name: "uiiq_till_ping",
    description: "Till device heartbeat — confirm the device is registered and active.",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await tillClient()("/till/ping", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json().catch(() => ({ ok: true }));
    },
  },
];
