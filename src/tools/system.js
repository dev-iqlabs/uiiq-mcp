import { apiClient } from "../auth.js";

// Compact the snapshot so the model gets the signal, not the raw sparkline arrays.
function summarise(s) {
  const alarmsFiring = (s.apps ?? []).reduce((n, a) => n + (a.alarms?.alarm ?? 0), 0);
  return {
    generatedAt: s.generatedAt,
    infra: {
      alarmsFiring,
      apps: (s.apps ?? []).map((a) => ({
        name: a.name,
        platform: a.platform,
        build: a.lastBuild ? `${a.lastBuild.status} (${a.lastBuild.branch})` : "unknown",
        alarms: a.alarms,
      })),
    },
    cost: s.cost
      ? {
          monthToDateUSD: s.cost.monthToDateUSD,
          budgetUSD: s.cost.budgetUSD,
          budgetPct: s.cost.budgetPct,
          anomaly: s.cost.anomaly,
          fetchedAt: s.cost.fetchedAt,
        }
      : null,
    services: (s.services ?? []).map((x) => ({
      key: x.key,
      status: x.status,
      latencyMs: x.latencyMs,
      ...(x.message ? { message: x.message } : {}),
    })),
    jobs: (s.jobs ?? []).map((j) => ({
      key: j.key,
      kind: j.kind,
      status: j.status,
      lastRunAt: j.lastRunAt ?? null,
      ...(j.message ? { message: j.message } : {}),
    })),
    errors: s.errors ?? [],
  };
}

export const systemTools = [
  {
    name: "uiiq_system_health",
    description:
      "Get the latest UIIQ System Health snapshot: Amplify infra/build status, CloudWatch alarm rollups, month-to-date AWS cost vs the monthly budget, internal service health (Postgres, Redis, Stripe, Twilio, SendGrid, ElevenLabs, IQEX, etc.), and cron/webhook job freshness. Super-admin only; reflects the last collector run (every ~30 min, or after the in-app 'Run check now').",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const res = await apiClient()("/admin/system-health");
      if (!res.ok) throw new Error(await res.text());
      const { snapshot } = await res.json();
      if (!snapshot) {
        return { status: "no snapshot yet — the System Health collector hasn't run" };
      }
      return summarise(snapshot);
    },
  },
];
