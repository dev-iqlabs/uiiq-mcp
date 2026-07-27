#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { tenantTools }    from "./tools/tenant.js";
import { contactTools }   from "./tools/contact.js";
import { orderTools }     from "./tools/order.js";
import { portfolioTools } from "./tools/portfolio.js";
import { taskTools }      from "./tools/task.js";
import { sellTools }      from "./tools/sell.js";
import { reportTools }    from "./tools/report.js";
import { automationTools } from "./tools/automation.js";
import { hrTools }         from "./tools/hr.js";
import { statusTools }    from "./tools/status.js";
import { agentTools }    from "./tools/agents.js";
import { growTools }           from "./tools/grow.js";
import { communicationsTools } from "./tools/communications.js";
import { commerceTools }       from "./tools/commerce.js";
import { billingTools }        from "./tools/billing.js";
import { documentTools }       from "./tools/document.js";
import { googleTools }         from "./tools/google.js";
import { seoTools }            from "./tools/seo.js";
import { smsTools }            from "./tools/sms.js";
import { socialTools }         from "./tools/social.js";
import { templateTools }       from "./tools/template.js";
import { planTools }           from "./tools/plan.js";
import { orgTools }            from "./tools/org.js";
import { legacyTools }         from "./tools/legacy.js";
import { campaignTools }       from "./tools/campaign.js";
import { retailTools }          from "./tools/retail.js";
import { costsTools }           from "./tools/costs.js";
import { creditsTools }         from "./tools/credits.js";
import { channelsTools }        from "./tools/channels.js";
import { brainsTools }          from "./tools/brains.js";
import { boardroomTools }       from "./tools/boardroom.js";
import { tillTools }            from "./tools/till.js";
import { systemTools }          from "./tools/system.js";
import { merchSetTools }        from "./tools/merch.js";
import { displayTools }         from "./tools/displays.js";
import { journeyTools }         from "./tools/journey.js";
import { menuTools }            from "./tools/menu.js";
import { ticketsTools }         from "./tools/tickets.js";
import { materialsTools }       from "./tools/materials.js";
import { donationsTools }       from "./tools/donations.js";

const ALL_TOOLS = [
  ...statusTools,
  ...systemTools,
  ...tenantTools,
  ...contactTools,
  ...orderTools,
  ...portfolioTools,
  ...taskTools,
  ...sellTools,
  ...reportTools,
  ...automationTools,
  ...hrTools,
  ...growTools,
  ...communicationsTools,
  ...commerceTools,
  ...billingTools,
  ...documentTools,
  ...googleTools,
  ...seoTools,
  ...smsTools,
  ...socialTools,
  ...templateTools,
  ...planTools,
  ...orgTools,
  ...legacyTools,
  ...campaignTools,
  ...retailTools,
  ...costsTools,
  ...creditsTools,
  ...channelsTools,
  ...brainsTools,
  ...boardroomTools,
  ...tillTools,
  ...agentTools,
  ...merchSetTools,
  ...displayTools,
  ...journeyTools,
  ...menuTools,
  ...ticketsTools,
  ...materialsTools,
  ...donationsTools,
];

const TOOL_MAP = Object.fromEntries(ALL_TOOLS.map(t => [t.name, t]));

const server = new Server(
  { name: "uiiq-mcp", version: "2.13.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: ALL_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOL_MAP[req.params.name];
  if (!tool) {
    return {
      content: [{ type: "text", text: "Unknown tool: " + req.params.name }],
      isError: true,
    };
  }
  try {
    const result = await tool.handler(req.params.arguments ?? {});
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: "Error: " + err.message }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
