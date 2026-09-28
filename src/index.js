#!/usr/bin/env node
import { createRequire } from "node:module";
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
import { adsTools }            from "./tools/ads.js";
import { communicationsTools } from "./tools/communications.js";
import { commerceTools }       from "./tools/commerce.js";
import { billingTools }        from "./tools/billing.js";
import { documentTools }       from "./tools/document.js";
import { localityTools }       from "./tools/locality.js";
import { competitorTools }     from "./tools/competitor.js";
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
import { targetsTools }         from "./tools/targets.js";
import { journeyTools }         from "./tools/journey.js";
import { menuTools }            from "./tools/menu.js";
import { ticketsTools }         from "./tools/tickets.js";
import { materialsTools }       from "./tools/materials.js";
import { donationsTools }       from "./tools/donations.js";
import { pricingTools }         from "./tools/pricing.js";
import { crmTools }             from "./tools/crm.js";
import { mediaTools }           from "./tools/media.js";
import { crmJourneyTools }      from "./tools/crm-journey.js";
import { prospectTools }        from "./tools/prospects.js";
import { connectTools }         from "./tools/connect.js";
import { iqplantTools }         from "./tools/iqplant.js";
import { postroomTools }        from "./tools/postroom.js";
import { appealsTools }         from "./tools/appeals.js";
import { auctionsTools }        from "./tools/auctions.js";
import { nx2uTools }            from "./tools/nx2u.js";
import { adminOpsTools } from "./tools/admin-ops.js";
import { adminPlatformTools } from "./tools/admin-platform.js";
import { apiTools } from "./tools/api.js";
import { assistantTools } from "./tools/assistant.js";
import { brandTools } from "./tools/brand.js";
import { businessesTools } from "./tools/businesses.js";
import { cardsTools } from "./tools/cards.js";
import { classesTools } from "./tools/classes.js";
import { estimatesTools } from "./tools/estimates.js";
import { eventsTools } from "./tools/events.js";
import { formsTools } from "./tools/forms.js";
import { fundingTools } from "./tools/funding.js";
import { integrationsTools } from "./tools/integrations.js";
import { mailTools } from "./tools/mail.js";
import { shopAdminTools } from "./tools/shop-admin.js";
import { smartPagesTools } from "./tools/smart-pages.js";
import { studentsTools } from "./tools/students.js";
import { teamTools } from "./tools/team.js";
import { virtualOfficeTools } from "./tools/virtual-office.js";
import { workflowTools } from "./tools/workflow.js";

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
  ...adsTools,
  ...communicationsTools,
  ...commerceTools,
  ...billingTools,
  ...documentTools,
  ...localityTools,
  ...competitorTools,
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
  ...targetsTools,
  ...journeyTools,
  ...menuTools,
  ...ticketsTools,
  ...materialsTools,
  ...donationsTools,
  ...pricingTools,
  ...crmTools,
  ...mediaTools,
  ...crmJourneyTools,
  ...prospectTools,
  ...connectTools,
  ...iqplantTools,
  ...postroomTools,
  ...appealsTools,
  ...auctionsTools,
  ...nx2uTools,
  ...adminOpsTools,
  ...adminPlatformTools,
  ...apiTools,
  ...assistantTools,
  ...brandTools,
  ...businessesTools,
  ...cardsTools,
  ...classesTools,
  ...estimatesTools,
  ...eventsTools,
  ...formsTools,
  ...fundingTools,
  ...integrationsTools,
  ...mailTools,
  ...shopAdminTools,
  ...smartPagesTools,
  ...studentsTools,
  ...teamTools,
  ...virtualOfficeTools,
  ...workflowTools,
];

const TOOL_MAP = Object.fromEntries(ALL_TOOLS.map(t => [t.name, t]));

// Read from package.json rather than a second copy here. This was pinned at
// "2.26.0" while package.json had reached 2.38.0, so the version this server
// announced over the protocol was twelve releases stale. That is not cosmetic:
// a session asked today whether the Targets tools had shipped, read "2.26.0",
// and concluded they had not — while all eleven of them sat in this same file.
const { version } = createRequire(import.meta.url)("../package.json");

const server = new Server(
  { name: "uiiq-mcp", version },
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
