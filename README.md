# uiiq-mcp

MCP server for the UIIQ platform (app.uiiq.co.uk). Every tool proxies one of UIIQ's own `/api` routes, so tenant scoping, feature gates and write rules stay server-side.

## What it can do

UIIQ is one subscription whose modules are grouped as **Sell**, **Grow** and **Run**, with platform add-ons on top. The tools follow the same shape. Each area below names the tool prefix to look for; the full inventory with one line per tool is under [Tools](#tools).

### Sell — bookings, tickets, payments and point of sale

| Feature | Tool prefix | You can |
| --- | --- | --- |
| Bookings and experiences | `uiiq_sell_experience_*`, `uiiq_sell_booking_*`, `uiiq_sell_calendar_week`, `uiiq_sell_session_generate` | Define bookable experiences, generate sessions, list a week's calendar, create and cancel bookings |
| Staff, resources, service areas | `uiiq_sell_staff_availability_*`, `uiiq_sell_resource_*`, `uiiq_sell_service_area_*` | Block and unblock staff, manage rooms and equipment, set the areas a field service covers |
| Field visits and visit subscriptions | `uiiq_sell_field_visit_*`, `uiiq_sell_visit_subscription_*`, `uiiq_sell_visit_reminder_status` | Track recurring visits and their reminders |
| Pricing and promotions | `uiiq_sell_pricing_rule_*`, `uiiq_sell_pricing_intelligence_recommend`, `uiiq_sell_promo_create` | Quote a price under the rules, ask for a recommended price, issue promo codes |
| Gift cards, vouchers, memberships | `uiiq_sell_gift_card_*`, `uiiq_sell_voucher_*`, `uiiq_sell_membership_plan_*`, `uiiq_sell_subscription_*` | Issue and bulk-issue gift cards, resend or regenerate vouchers, manage membership plans, review and cancel members |
| Tickets | `uiiq_ticket_*` | Issue tickets, scan them at the door, see scan stats, forward tickets |
| Donations | `uiiq_donations_*` | Run causes, report on giving, export Gift Aid |
| Orders and commerce | `uiiq_order_*`, `uiiq_commerce_*`, `uiiq_channels_*`, `uiiq_merch_set_*` | Hold and annotate orders, provision hosted shops, set fee rates, settle payouts, sync marketplace channels |
| Retail | `uiiq_retail_*` | Products, categories, suppliers, low-stock alerts, shop sync, stock reasons and reports |
| Till and kitchen | `uiiq_till_*` | Ping a paired till, verify a staff PIN, take a sale or payment intent, redeem an IQPlant plan code |
| Menus (food and drink) | `uiiq_menu_*` | Generate a menu kit, build the live menu, manage menu documents |
| Classes and students | `uiiq_classes_*`, `uiiq_students_*` | Terms, course runs, enrolments (pay now or instalments), registers (attendance, scan, stars, costumes), notices, parent policies; student records, progress notes, check-in cards (medical fields only on get), absences (illness and time off) |
| Customer cards | `uiiq_cards_*` | Issue, reissue, revoke, hand over and print member and student cards through IQEX (QR/NFC and branding only, never a name; printing spends credits) |
| Till back office, kitchen, tables | `uiiq_till_*` | Devices, staff, day close, daily summary, refunds, payment config, food orders and settlement, KDS tickets, tables and their QR codes (floor routes take the device token) |
| Bookings admin | `uiiq_blockout_*`, `uiiq_checkin_*`, `uiiq_custom_field_*`, `uiiq_waiver_*`, `uiiq_ticket_type_*`, `uiiq_booking_refund`, `uiiq_promo_code_*` | Blockouts, the calendar, door check-in, custom booking fields, waivers, ticket types, refunds (real money), promo codes |
| Forms | `uiiq_form_*` | Build and send forms (counts against the email allowance), read results and export CSV (owner/admin), publish IQForms to the Members App |

### Grow — marketing, CRM and prospecting

| Feature | Tool prefix | You can |
| --- | --- | --- |
| Contacts and segments | `uiiq_contact_*`, `uiiq_segment_*` | List, add, edit, archive or convert contacts into businesses; preview segments |
| CRM pipeline | `uiiq_prospect_list/get/create/update`, `uiiq_interaction_*`, `uiiq_followups_due` | Move prospects, suppliers and partners along the pipeline, log and edit interactions, see what follow-ups are due |
| Find Prospects | `uiiq_prospect_search_*`, `uiiq_prospect_preset_*`, `uiiq_prospect_sweep_start`, `uiiq_prospect_source_*` | Start a search in businesses, acts, tenders or funding mode, save briefs as presets, sweep town by town, review candidates, read the funnel, manage the source registry |
| Bids and outreach | `uiiq_prospect_job_*`, `uiiq_prospect_video_invite_*`, `uiiq_prospect_ingest` | Adopt tenders and funding calls as bids, send a personalised video hello, bulk-ingest enquiries |
| Email and SMS campaigns | `uiiq_campaign_*`, `uiiq_sms_*` | Create, duplicate and test-send campaigns, read SMS history |
| Social and press | `uiiq_social_*`, `uiiq_press_release_*`, `uiiq_journalist_contact_*` | Schedule posts from templates, draft, redraft, approve and distribute press releases |
| Briefs | `uiiq_grow_brief_morning*`, `uiiq_grow_campaign_brief_generate` | Read or generate the morning brief, turn one campaign brief into channel copy |
| Ads & Search | `uiiq_ads_*` | The overview, keyword research and rank tracking, the keyword gap against a competitor, local search (map pack, local keywords, nearby competitors), YouTube research, advert videos (generate on an engine, approve, publish, SEO copy, thumbnails), Google campaign controls, Pinterest alerts, Google review reply drafts. Needs `ads_search`; research spends credits |
| Competitors | `uiiq_competitor_*`, `uiiq_admin_competitor_research_block` | Track competitors as companies with several domains, a priority, market, Facebook Page ID, socials and notes; research them on IQEX, watch rules and their hits; honour a research objection across every tenant |
| SEO and Google | `uiiq_seo_*`, `uiiq_google_*` | Run audits, apply fixes, check PageSpeed, read Ads, Analytics and Search Console |
| Pricing | `uiiq_price_list`, `uiiq_price_item_*`, `uiiq_pricing_leads_list` | Page through price items by type, add / edit / delete them, see who used the public pricing calculator |
| Website connect | `uiiq_iqlink_claim`, `uiiq_tenant_api_key_get`, `uiiq_tenant_api_key` | Pair a connected site, look up its Connect key, or rotate it |
| Businesses | `uiiq_business_*` | People on a business, templated emails to it (real sends), what deleting it would affect |
| Events | `uiiq_event_*` | Events with AI-generated content fanned out to socials (needs `events`; generate spends credits; approve queues the posts) |
| Brand website pages | `uiiq_brand_*` | Change requests on the customer's website: chat, stage, publish to the live site (owner/admin), staging sync |
| Smart pages | `uiiq_smart_pages_*` | Approve or send back pages, moderate messages (needs `smart_pages`, linked to IQEX) |
| Social inbox, hashtags, settings | `uiiq_social_*` | Posts (edit, duplicate, publish), the inbox, hashtag groups, auto-publish settings, account removal |

### Run — operations, finance, people and knowledge

| Feature | Tool prefix | You can |
| --- | --- | --- |
| Tasks and boards | `uiiq_task_*`, `uiiq_board_*` | Create projects, boards and cards, assign, comment, move, tick checklists |
| Workflows and automations | `uiiq_workflow_*`, `uiiq_automation_*` | Trigger workflows, inspect instances, toggle automations |
| HR and payroll | `uiiq_hr_*` | Staff records (create, edit, deactivate and reactivate), clock-ins, timesheets, leave approvals, payroll runs and exports |
| Costs and planning | `uiiq_costs_*`, `uiiq_plan_*`, `uiiq_report_*` | Bills, allocations, recurring costs, period locks, KPI rolls; the business plan's revenue, expenses, personnel and statements; revenue and usage reports |
| Targets board | `uiiq_targets_*` | Every product's target against its actual by week, month or year; set a line's stage and launch month, merge monthly targets, add and test where actuals come from, type figures in |
| Billing and credits | `uiiq_billing_*`, `uiiq_credits_*` | Invoices, usage, billing overrides, the IQEX credit balance and ledger |
| Portfolio | `uiiq_portfolio_*` | Every product as a project record with blockers |
| Documents, media, templates | `uiiq_document_*`, `uiiq_media_*`, `uiiq_template_*` | Read documents, upload or generate media, use social and email templates |
| Knowledge and advisors | `uiiq_brains_*`, `uiiq_boardroom_*`, `uiiq_agent_*` | Ask a sector Brain, run a Boardroom session with the Mastermind team, read agent definitions |
| Journeys | `uiiq_journey_*` | Start, advance and resume guided Make-a-Trail journeys |
| Materials and legacy films | `uiiq_material_*`, `uiiq_legacy_*` | Discover, verify and watch materials, check whether each lead's link leads anywhere, edit or delete a material; list legacy films |
| Postroom | `uiiq_postroom_*`, `uiiq_admin_postroom_*` | The parcels board: product ready, label printed, dispatch, corrections, add recent orders, the return address (needs the `postroom` feature). Postroom HQ: every tenant's parcels for platform admins. A shop gets on it by REQUESTING it with a click in UiiQ (its owner or admin accepts the in-app terms in Postroom settings, and a code is generated), or a platform admin raises it for the shop in the admin UI with the evidence. Those are an Art 28 acceptance, so no tool can make them; `uiiq_postroom_hq_request_status` / `_withdraw` and the admin status / withdraw tools read and stop them. `postroom_hq` can then be switched on via `uiiq_tenant_features`. Per-tenant HQ log: `uiiq_postroom_hq_log`, `uiiq_admin_postroom_hq_log` |
| Appeals | `uiiq_appeal_*`, `uiiq_admin_appeal_suspend` | Fundraising appeals on a cause: draft, publish under the Fundraising Regulator's Code, match pledges, updates emailed to supporters (needs the `appeals` feature) |
| Auctions | `uiiq_auction_*` | The seller's side: draft, lots, publish, bids, withdraw, defaults (needs the `auctions` feature; buyers bid through the public API) |
| NX2U live streaming | `uiiq_nx2u_*` | Channels, events, the control room (provision, running order, slate, end, replay), the video library, usage (needs the `nx2u` feature; platform switches OFF until Steve turns them on) |
| Funding, estimates, integrations | `uiiq_funding_*`, `uiiq_estimates_*`, `uiiq_integrations_*`, `uiiq_virtual_office_*` | Funding projects, headings, allocations and claims (Xero invoices); estimates with lines and proposals; integration sources and Xero config; compliance reminders |
| Workflow config | `uiiq_workflow_*` | Workflow types, tiers and keepsakes, connected sites (tokens shown once), the board, email triggers, order assignment and approval requests |
| Mail | `uiiq_mail_*` | The Office → Mail log: items received, scanned, forwarded, shredded |
| Assistant and team | `uiiq_assistant_*`, `uiiq_team_*` | Ask the assistant (spends credits), chat with a Mastermind agent, provision the team |
| Agents | `uiiq_agent_*` | Read, edit and sync agent definitions, skills and references (writes are SUPER_ADMIN; evolve spends the platform's Anthropic budget) |

### Devices and IQ products

| Feature | Tool prefix | You can |
| --- | --- | --- |
| IQDisplay signage | `uiiq_display_*` | Screens, channels, items, groups and schedules; token boards (KPI, showcase, targets wall) including a targets board's layout |
| IQPlant | `uiiq_iqplant_*`, `uiiq_till_iqplant_plan_code` | Garden Planner plans, nursery stock mapping, plan-code redemption at the till |

### Platform administration

| Feature | Tool prefix | You can |
| --- | --- | --- |
| Tenants and organisations | `uiiq_tenant_*`, `uiiq_org_*` | Create, rename, delete or restore tenants, set features and launch stage, read usage |
| Health | `uiiq_status`, `uiiq_system_health` | API health and latency, infrastructure, alarms and AWS cost against budget |
| Platform admin | `uiiq_admin_*` | Tenant control plane (IQEX link and keys, members, users, products, settings, Stripe fee), API keys, features, VAT, audit log, staff, groups, sites, locations, venues, booking emails, briefing, credit costs, ads tiers and gates, add-ons; secrets are shown once |
| Shop admin, print, designs, suppliers | `uiiq_shop_*`, `uiiq_print_*`, `uiiq_design_*`, `uiiq_supplier_*` | The shop catalogue and its pushes to WooCommerce, connected shops, shop orders, print products, techniques and tiers, the print queue, designs and proofs, suppliers and their syncs |
| Presets, pricing, registries | `uiiq_preset_*`, `uiiq_pricing_*`, `uiiq_iqex_form_*`, `uiiq_launcher_card_*`, `uiiq_workshop_card_*`, `uiiq_task_recipe_*`, `uiiq_journalist_admin_*`, `uiiq_design_brief_*`, `uiiq_acts_direct_*`, `uiiq_press_distribution_*` | Feature presets applied to tenants, platform pricing config and quotes, the IQEX forms registry and spec, launcher and workshop cards, task recipes, journalist contacts, design briefs, Acts Direct sites, press distribution |
| API | `uiiq_api_*` | Ping, the OpenAPI document, a Sentry self-test (SUPER_ADMIN) |

### Asking the server directly

The server describes itself over the MCP protocol: `tools/list` returns every tool with its description and input schema, which is what this README is generated from. Any MCP client can ask it what it can do without reading this file.

## Setup

```
npm install
uiiq login            # stores ~/.uiiq/credentials.json (email + session; the CLI)
```

Claude config: `{ "command": "node", "args": ["<path>/src/index.js"] }`.

| Env var | Purpose |
| --- | --- |
| `UIIQ_BASE` | API origin (default `https://app.uiiq.co.uk`) |
| `UIIQ_MCP_INHERIT_IMPERSONATION=1` | Honour a `uiiq tenant impersonate` session from the CLI (reads only) |
| `UIIQ_MCP_INHERIT_WRITE=1` | …and allow writes through it |
| `UIIQ_TILL_DEVICE_TOKEN` | Till tools: the paired device token |
| `UIIQ_CONNECT_API_KEY` | `uiiq_prospect_ingest`: the tenant's Connect key (or pass `apiKey`) |

**Tenant handling.** Most tools take an optional `tenant` (id, slug or exact name). Without it the call lands in the tenant the login belongs to; with it the server impersonates that tenant for the one call (SUPER_ADMIN only, audit-logged, 30-minute session). `/api/admin/*` tools are operator-scoped and take no `tenant`.

Not exposed on purpose: the platform-to-platform callbacks under `/api/platform/**` and `/api/play/[token]/kiosk-event` (machine-to-machine, secret-authenticated).

## Tools


### Status — `src/tools/status.js`

| Tool | What it does |
| --- | --- |
| `uiiq_status` | Check health and latency of the UIIQ platform, and which tenant tool calls are currently acting as. |

### System health — `src/tools/system.js`

| Tool | What it does |
| --- | --- |
| `uiiq_system_health` | Get the latest UIIQ System Health snapshot: Amplify infra/build status, CloudWatch alarm rollups, month-to-date AWS cost vs the monthly budget, internal service health (Postgres, Redis, Stripe, Twilio, SendGrid, ElevenLabs, IQEX, etc.), and cron/webhook job freshness. |

### Tenants — `src/tools/tenant.js`

| Tool | What it does |
| --- | --- |
| `uiiq_tenant_list` | List UIIQ tenants (summary rows). |
| `uiiq_tenant_get` | Get full detail for a UIIQ tenant by ID, including its launchStage (DORMANT, ONBOARDING, DEVELOPMENT, DEMO, ROLLOUT or LIVE) and launchTestRecipients. |
| `uiiq_tenant_create` | Create a new UIIQ tenant. |
| `uiiq_tenant_api_key` | ROTATE the UIIQ Connect API key for a tenant: issues a NEW key and returns it once. |
| `uiiq_tenant_api_key_get` | Look up a tenant's CURRENT UIIQ Connect API key (the key the uiiq-connect WordPress plugin, IQEX and n8n send). |
| `uiiq_tenant_features` | Get or set feature flags for a UIIQ tenant. Enabling `postroom_hq` needs the tenant's ACTIVE Postroom HQ request (409 without one); the request's code is audited. |
| `uiiq_tenant_usage` | Get usage stats for a UIIQ tenant (sends, contacts, API calls). |
| `uiiq_tenant_rename` | Change a UIIQ tenant's slug. |
| `uiiq_tenant_launch_stage_set` | Set a tenant's launch stage and/or its test list. |
| `uiiq_tenant_delete` | Delete or restore a UIIQ tenant. |
| `uiiq_tenant_settings_update` | Update a tenant's own settings — patch semantics, only the fields you send change. |

### Organisations — `src/tools/org.js`

| Tool | What it does |
| --- | --- |
| `uiiq_org_list` | List organisations. |
| `uiiq_org_get` | Get an organisation by ID. |
| `uiiq_org_features` | Get feature flags / entitlements for an organisation. |
| `uiiq_org_onboarding_status` | Whether the workspace has completed onboarding ({ completed }). |
| `uiiq_org_profile_get` | The workspace's own tenant profile — name, description, industry, contact details, address, logo, brand colours, socials, email identity, onboarding state. |
| `uiiq_org_profile_update` | Update the workspace profile (the Settings → Profile screen): only the fields you send change; an empty string clears one. |

### Contacts — `src/tools/contact.js`

| Tool | What it does |
| --- | --- |
| `uiiq_contact_list` | List UIIQ contacts. |
| `uiiq_contact_get` | Get a UIIQ contact by ID. |
| `uiiq_contact_create` | Add one contact by hand. |
| `uiiq_contact_update` | Edit one contact, or archive / restore it. |
| `uiiq_contact_delete` | Remove a contact — SOFT: it is archived, leaving every list and every campaign audience, but its send history, donations and student links survive so past campaign stats stay honest. |
| `uiiq_contact_convert` | Move marketing Contacts into the relationship layer as Businesses (PROSPECT / CUSTOMER / SUPPLIER / PARTNER) — for the Xero-export-landed-in-the-mailing-list case. |
| `uiiq_contact_delete_impact` | What a HARD delete of a contact would destroy (campaign sends and their open/click history, SMS sends, automation runs, business-person links, students, bookings, donations — each with a count) and any blockers that forbid it (financial records). |

### CRM — businesses (prospects / suppliers / partners) — `src/tools/crm.js`

| Tool | What it does |
| --- | --- |
| `uiiq_prospect_list` | List a tenant's prospects (or suppliers / partners / business customers) with pipeline stage counts. |
| `uiiq_prospect_get` | Get one business — full record including its people and any custom fields from import. |
| `uiiq_prospect_create` | Add a prospect (or supplier / partner) by hand. |
| `uiiq_prospect_update` | Update a business — most often to move it along the pipeline: { stage: 'CONTACTED' }. |
| `uiiq_prospect_import` | Bulk-import businesses from already-parsed rows (e.g. |
| `uiiq_prospect_campaign_terms_get` | The Prospect Campaigns terms addendum: current version, full text, this workspace's acceptance (or null) and canAccept (true for the workspace's own OWNER/ADMIN, never an impersonating operator). |
| `uiiq_prospect_campaign_terms_accept` | Accept the Prospect Campaigns terms for the workspace, as its own OWNER or ADMIN (403 when impersonating or for other roles). |

### CRM — interactions, follow-ups, Find Prospects searches — `src/tools/crm-journey.js`

| Tool | What it does |
| --- | --- |
| `uiiq_interaction_log` | Log an interaction on a business/prospect — a call (with structured outcome), email (paste it in), meeting, note, or SOCIAL outreach (a DM on the prospect's socials; put the platform in `subject`, e.g. |
| `uiiq_interaction_list` | The journey on one business — every logged call, email, meeting, note and social outreach, newest-happened-first. |
| `uiiq_followups_due` | Every due or overdue follow-up on the tenant's businesses, oldest first — the 'what should I chase today' list. |
| `uiiq_interaction_update` | Tick a follow-up off (or un-tick it). |
| `uiiq_interaction_delete` | Delete a mislogged interaction. |
| `uiiq_prospect_search_start` | Start a Find Prospects discovery search: describe who you're looking for and where; the research engine (IQEX) returns candidates with a reason and source each, for review. |
| `uiiq_prospect_search_rerun` | Run a stuck or failed search again on the SAME row with the brief it already has. |
| `uiiq_prospect_search_delete` | Remove a search and its candidates. |
| `uiiq_prospect_search_funnel` | The tenant's Find Prospects funnel over the last N days — searches run, candidates delivered, adopted, dismissed, and what happened next. |
| `uiiq_prospect_search_list` | List the tenant's Find Prospects searches with status and candidate counts. |
| `uiiq_prospect_search_get` | One search with its candidates: business, contact, reason, source_url, opener, and whether each already exists in the pipeline. |
| `uiiq_prospect_search_review` | Review one candidate: 'adopt' creates the Business (source contact-hunter) + person + an opening NOTE carrying the reason and source — or attaches a note to the existing business when the candidate was flagged as already known. |

### CRM — presets, sweeps, Prospect Jobs, source registry, video invite, ingest — `src/tools/prospects.js`

| Tool | What it does |
| --- | --- |
| `uiiq_prospect_preset_list` | The tenant's saved Find Prospects briefs — press one, type a town, go. |
| `uiiq_prospect_preset_create` | Save a Find Prospects brief as a preset. |
| `uiiq_prospect_preset_update` | Replace a preset. |
| `uiiq_prospect_preset_delete` | Delete a saved preset. |
| `uiiq_prospect_sweep_start` | A town sweep: one preset × many towns = one job, one review list. |
| `uiiq_prospect_job_list` | The tenant's tenders and funding calls found by Find Prospects (mode tenders/funding), soonest deadline first. |
| `uiiq_prospect_job_update` | Review one tender / funding call: 'adopt' turns it into a task card on the tenant's 'Prospect Jobs' board (created on first use) — due two days before the deadline (HIGH inside a fortnight), or 'write to them' in a fortnight for a funder with no deadline. |
| `uiiq_prospect_source_list` | SUPER_ADMIN. |
| `uiiq_prospect_source_create` | SUPER_ADMIN. |
| `uiiq_prospect_source_update` | SUPER_ADMIN. |
| `uiiq_prospect_video_invite_create` | Render a personalised 'we'd love you on board' talking-head video for an ADOPTED candidate (IQEX HeyGen path; charged to the tenant's IQEX org on success, idempotent per candidate). |
| `uiiq_prospect_video_invite_get` | Poll an adopted candidate's video invite: { invite: null } when none was started; status pending \| complete (with url) \| failed. |
| `uiiq_prospect_ingest` | A business enquiry becomes a prospect — the route IQForms (via iqlink) and website forms feed lead generation through. |

### Connect / IQlink — `src/tools/connect.js`

| Tool | What it does |
| --- | --- |
| `uiiq_connect_code` | Mint a short-lived pairing code for connecting this tenant's website or IQEX: { code, expiresAt, expiresInSeconds }. |
| `uiiq_iqlink_claim` | Exchange an IQlink pairing code for the tenant's Connect key: { apiKey, tenantSlug, tenantName, apiBase }. |

### Orders — `src/tools/order.js`

| Tool | What it does |
| --- | --- |
| `uiiq_online_order_list` | List WooCommerce shop orders UiiQ Connect has sent to UIIQ (the Online orders page), newest first. |
| `uiiq_online_order_get` | One online order in full: line items (with coin / configurator / design / proof flags), goods, VAT, shipping, total, refunds with dates and reasons, customer and addresses, what happened next (journey, credits granted, production work) and a link to the order in WooCommerce admin. |
| `uiiq_order_list` | List orders — WooCommerce shop orders sent by UiiQ Connect (same data as uiiq_online_order_list; returns just the orders). |
| `uiiq_order_get` | Get full detail for an order by its WooCommerce order number (same as uiiq_online_order_get with ref). |
| `uiiq_order_note` | Add a note to a legacy workflow order. |
| `uiiq_order_hold` | Put a legacy workflow order on hold. |

### Portfolio — `src/tools/portfolio.js`

| Tool | What it does |
| --- | --- |
| `uiiq_portfolio_list` | List UIIQ portfolio projects (summary rows). |
| `uiiq_portfolio_get` | Get a portfolio project by ID, including its blockers and milestones. |
| `uiiq_portfolio_update` | Update a portfolio project status or progress percentage. |
| `uiiq_portfolio_blocker_add` | Add a blocker to a portfolio project. |
| `uiiq_portfolio_blocker_resolve` | Mark a portfolio project blocker as resolved. |
| `uiiq_portfolio_task_board_link` | Link a task board to a portfolio project so the board's cards feed the project's progress. |
| `uiiq_portfolio_task_board_unlink` | Unlink a task board from a portfolio project (the board and its cards are untouched). |

### Tasks (projects / boards / cards) — `src/tools/task.js`

| Tool | What it does |
| --- | --- |
| `uiiq_task_project_list` | List UIIQ task projects (the containers boards live in), with their boards. |
| `uiiq_task_project_create` | Create a UIIQ task project. |
| `uiiq_board_list` | List all UIIQ task boards, with their project, columns and card counts. |
| `uiiq_board_get` | Get one UIIQ task board in full — every column with its cards. |
| `uiiq_board_create` | Create a UIIQ task board. |
| `uiiq_board_update` | Rename a UIIQ task board, change its accent colour, or reorder it. |
| `uiiq_board_delete` | Delete a UIIQ task board. |
| `uiiq_board_column_add` | Add a column to a UIIQ task board. |
| `uiiq_board_column_update` | Rename, recolour or reorder a column on a UIIQ task board. |
| `uiiq_board_column_delete` | Delete a column from a UIIQ task board. |
| `uiiq_task_members` | List the people a UIIQ task card can be assigned to on this tenant. |
| `uiiq_task_list` | List UIIQ tasks. |
| `uiiq_task_get` | Get a UIIQ task card by ID — description, checklists, comments, attachments and activity. |
| `uiiq_task_create` | Create UIIQ task cards. |
| `uiiq_task_update` | Update a UIIQ task card — retitle, edit the description, change status/priority/due date/labels, or reassign. |
| `uiiq_task_assign` | Assign a UIIQ task card to someone by id, email or name. |
| `uiiq_task_move` | Move a UIIQ task card to another column on its board — by column name (or a status word) or exact column id. |
| `uiiq_task_delete` | Delete a UIIQ task card. |
| `uiiq_task_comment` | Add a comment to a UIIQ task card. |
| `uiiq_task_checklist_add` | Add a checklist item to a UIIQ task card (creates the checklist if the card hasn't got one). |
| `uiiq_task_checklist_check` | Tick or untick a checklist item on a UIIQ task card. |
| `uiiq_task_attachment_list` | List a UIIQ task card's attachments (file name, URL, size, type, who added it, when). |
| `uiiq_task_attachment_add` | Attach a file to a UIIQ task card by URL — the file must already be hosted (e.g. |
| `uiiq_task_attachment_delete` | Remove an attachment from a UIIQ task card. |

### Sell (bookings, experiences, staff, vouchers, memberships) — `src/tools/sell.js`

| Tool | What it does |
| --- | --- |
| `uiiq_sell_booking_list` | List UIIQ experience bookings. |
| `uiiq_sell_experience_list` | List UIIQ experiences available for booking. |
| `uiiq_sell_subscription_list` | List UIIQ membership subscribers (members), newest first. |
| `uiiq_sell_subscription_get` | One membership subscriber by id: plan, status, member code, address, residency-check outcome and who verified it. |
| `uiiq_sell_subscription_review` | Residency review for a residents-only pass. |
| `uiiq_sell_subscription_cancel` | Cancel a member (owner/admin). |
| `uiiq_sell_promo_create` | Create a UIIQ promo discount code. |
| `uiiq_sell_gift_card_issue` | Issue a UIIQ gift card / voucher. |
| `uiiq_sell_gift_card_bulk_issue` | Bulk-issue vouchers (max 500). |
| `uiiq_sell_gift_card_balance` | Check a voucher's validity/balance by code. |
| `uiiq_sell_voucher_download` | Get the download URL for a voucher's printable artifact (PNG for vouchers rendered by UIIQ, legacy PDF for pre-migration cards). |
| `uiiq_sell_voucher_resend` | Re-send a voucher's email to its recipient. |
| `uiiq_sell_voucher_regenerate` | Re-render a voucher's printable artifact (e.g. |
| `uiiq_sell_voucher_template_get` | Get the tenant's voucher branding template (vendor name, logo, accent colour, footer, background artwork). |
| `uiiq_sell_voucher_template_update` | Update the tenant's voucher branding. |
| `uiiq_sell_booking_get` | Get a UIIQ booking by ID. |
| `uiiq_sell_booking_create` | Create a new UIIQ booking. |
| `uiiq_sell_booking_cancel` | Cancel a UIIQ Sell booking by ID. |
| `uiiq_sell_calendar_week` | Get the UIIQ Sell week calendar — sessions grouped by day, visit-mode bookings (visits, keyed by date: reference, customer, postcode, window, resource), active staff (performers), and per-staff availability blocks. |
| `uiiq_sell_staff_availability_list` | List availability blocks (full-day or time-range) for a UIIQ Sell staff member. |
| `uiiq_sell_staff_availability_block` | Block a UIIQ Sell staff member's availability on a date. |
| `uiiq_sell_staff_availability_unblock` | Remove a UIIQ Sell staff availability block. |
| `uiiq_sell_resource_list` | List UIIQ Sell bookable resources (rooms, equipment, vehicles). |
| `uiiq_sell_resource_create` | Create a UIIQ Sell bookable resource (room, chair, equipment, vehicle). |
| `uiiq_sell_resource_delete` | Delete a UIIQ Sell resource by ID. |
| `uiiq_sell_pricing_rule_list` | List UIIQ Sell pricing rules (off-peak discounts, weekend surcharges, seasonal pricing). |
| `uiiq_sell_pricing_rule_create` | Create a UIIQ Sell pricing rule. |
| `uiiq_sell_pricing_rule_update` | Edit a UIIQ Sell pricing rule. |
| `uiiq_sell_pricing_rule_delete` | Delete a UIIQ Sell pricing rule by ID. |
| `uiiq_sell_pricing_rule_quote` | Preview what a UIIQ Sell experience would cost on a given date after all matching pricing rules cascade. |
| `uiiq_sell_pricing_intelligence_recommend` | Fetch AI-recommended price adjustments for upcoming UIIQ Sell sessions. |
| `uiiq_sell_service_area_list` | List the tenant's UIIQ Sell service-area territories (postcode-prefix zones with a default technician for visit-mode auto-assign) plus the technician picker. |
| `uiiq_sell_service_area_create` | Create a UIIQ Sell service-area territory. |
| `uiiq_sell_service_area_update` | Update a UIIQ Sell service-area territory. |
| `uiiq_sell_service_area_delete` | Delete a UIIQ Sell service-area territory by ID. |
| `uiiq_sell_field_visit_list` | The technician field app's day view: every visit-mode booking for the tenant on a day, optionally filtered to one technician. |
| `uiiq_sell_field_visit_update` | Technician field-app update to one visit-mode booking. |
| `uiiq_sell_resource_notify_set` | Set a UIIQ Sell resource's technician flag and notify contact (used by visit reminders + day-of digests). |
| `uiiq_sell_field_visit_get` | Get one UIIQ Sell visit-mode booking by ID (tenant-scoped) — full field-app detail: customer, address, window, stage, completion notes/photos/signature, reschedule count. |
| `uiiq_sell_visit_subscription_list` | List the tenant's UIIQ Sell recurring visit agreements (with default technician + service-area names). |
| `uiiq_sell_visit_subscription_create` | Create a UIIQ Sell recurring visit agreement (auto-generates visit bookings every intervalDays). |
| `uiiq_sell_visit_subscription_update` | Update a UIIQ Sell recurring visit agreement. |
| `uiiq_sell_visit_subscription_delete` | Delete a UIIQ Sell recurring visit agreement by ID. |
| `uiiq_sell_visit_reminder_status` | Read the tenant's UIIQ Sell VisitReminder ledger (the day-before cron dispatches these; this is the read-only view). |
| `uiiq_sell_experience_create` | Create a UiiQ experience (the sellable thing: an event, a timed entry, a class). |
| `uiiq_sell_experience_update` | Update a UiiQ experience — price, status, images, capacity, duration, description. |
| `uiiq_sell_session_generate` | Create the actual bookable dates for an experience by expanding a weekly pattern over a date range. |
| `uiiq_sell_membership_plan_list` | List the tenant's membership plans and passes, with prices in pence. |
| `uiiq_sell_membership_plan_create` | Create a membership plan or a fixed-term pass. |
| `uiiq_sell_membership_plan_delete` | Delete a membership plan. |
| `uiiq_sell_membership_plan_update` | Change a membership plan or pass — price, name, term, auto-renew, active state. |
| `uiiq_sell_gift_programmes` | The tenant's Gift Programmes (read-only): key, card type, label, enabled, the values on offer with buyerPence, and the journey / outcome each one drives. |
| `uiiq_sell_field_visit_presign` | Get a presigned S3 POST for a field visit's proof photo (JPEG/PNG/WebP, 15 MB) or the customer signature (PNG, 2 MB). |

### Tickets — `src/tools/tickets.js`

| Tool | What it does |
| --- | --- |
| `uiiq_ticket_list` | List the individual scannable tickets on a booking (one per seat), with admit status. |
| `uiiq_ticket_issue` | Issue individual QR tickets for a confirmed booking (one per seat). |
| `uiiq_ticket_scan` | Admit (or undo) a single ticket by its code — the door-scan action. |
| `uiiq_ticket_scan_stats` | Today's door-scan stats for the tenant: tickets admitted today and total issued. |
| `uiiq_ticket_forward_list` | List this tenant's scan fan-out targets — downstream products (Acts Direct / CountryComp) that receive a presence-verified scan when a ticket is admitted. |
| `uiiq_ticket_forward_create` | Register a downstream target that receives a scan event whenever a ticket is admitted (presence-verified reviews for Acts Direct / CountryComp). |
| `uiiq_ticket_forward_delete` | Remove a scan fan-out target by id. |
| `uiiq_ticket_qr` | Save a ticket's QR code (600px PNG encoding /t/<code>, the same image the e-ticket carries) to a local file. |

### Donations — `src/tools/donations.js`

| Tool | What it does |
| --- | --- |
| `uiiq_donations_causes_list` | List the tenant's donation causes (the charity's giving options). |
| `uiiq_donations_cause_get` | Get a single donation cause by ID. |
| `uiiq_donations_cause_create` | Create a donation cause. |
| `uiiq_donations_cause_update` | Update a donation cause by ID — rename, edit description/image, reorder (displayOrder) or (de)activate. |
| `uiiq_donations_cause_delete` | Delete a donation cause by ID. |
| `uiiq_donations_report` | The charity's donation dashboard (tenant-scoped, owners/admins only): all-time and this-month totals, per-cause breakdown, recurring-donor count, Gift-Aid totals (incl. |
| `uiiq_donations_gift_aid_export` | Download the HMRC-ready Gift Aid CSV of eligible SUCCEEDED donations (donor name, address, postcode, amount, date). |
| `uiiq_donations_subscription_cancel` | Cancel a recurring (monthly) donation by its Stripe subscription ID. |

### Campaigns — `src/tools/campaign.js`

| Tool | What it does |
| --- | --- |
| `uiiq_campaign_get` | Get an email campaign by ID. |
| `uiiq_campaign_create` | Create a new email campaign. |
| `uiiq_campaign_prospect_audience` | Preview who a campaign to prospects would go to — nothing is sent or created. |
| `uiiq_campaign_responses` | Who pressed which reply button on a campaign that carried them: counts for Tell me more / Interested / Not interested (each recipient's latest press), one row per recipient with their contact and matched prospect (null when they are not in the pipeline — nothing is invented), and how many presses looked like a corporate link scanner and were ignored. |
| `uiiq_campaign_duplicate` | Duplicate an existing campaign. |
| `uiiq_campaign_test_send` | Send a test email for a campaign to a given address. |
| `uiiq_segment_list` | List contact segments. |
| `uiiq_segment_preview` | Preview which contacts match a segment. |
| `uiiq_campaign_send` | SEND an email campaign to its audience now (subscribed contacts, or the CRM pipeline for a prospects campaign — gated on `prospect_campaigns`). |
| `uiiq_campaign_ab_test_get` | The A/B subject-line test on a campaign (subjectA/B, splitPercent, winnerMetric, winnerPickAt), or null when there is none. |
| `uiiq_campaign_ab_test_set` | Create or replace the A/B subject-line test on a DRAFT or SCHEDULED campaign: subjectA, subjectB, splitPercent 5-45 (default 20), winnerMetric open (default) \| click, winnerPickAt (ISO). |
| `uiiq_campaign_ab_test_delete` | REMOVE the A/B test from a campaign (back to a single subject). |
| `uiiq_marketing_calendar` | The marketing calendar for a window of up to 100 days: events (start to end), scheduled/published social posts (snippet, platforms) and campaign sends. |

### SMS — `src/tools/sms.js`

| Tool | What it does |
| --- | --- |
| `uiiq_sms_list` | List SMS messages for the tenant. |
| `uiiq_sms_get` | Get an SMS message by ID. |
| `uiiq_sms_campaign_send` | SEND an SMS campaign now to its audience (SMS-subscribed contacts with a phone, one per household, 500 max per send) via Twilio. |

### Social — `src/tools/social.js`

| Tool | What it does |
| --- | --- |
| `uiiq_social_posts` | List social media posts. |
| `uiiq_social_accounts` | List connected social media accounts. |
| `uiiq_social_template_list` | List the tenant's IQEX Design Studio social templates (each with field_config so a personalise form can be built). |
| `uiiq_social_template_render` | Render an IQEX Design Studio social template with the tenant's field values (IQEX charges the org pool), then create a DRAFT SocialPost carrying the rendered PNG so it can be scheduled/published through the channels. |
| `uiiq_social_post_get` | One social post with its targets (account, platform, status, permalink, error). |
| `uiiq_social_post_update` | Partial update of a DRAFT, QUEUED or SCHEDULED post: content, hashtags, scheduledAt (ISO, null to unschedule), status. |
| `uiiq_social_post_save` | The full composer save of a DRAFT, QUEUED or SCHEDULED post: content (required), mediaUrls, hashtags, targetAccountIds (at least one connected account; Instagram needs a media URL), status DRAFT \| QUEUED \| SCHEDULED (+ scheduledAt). |
| `uiiq_social_post_delete` | DELETE a social post and its targets. |
| `uiiq_social_post_duplicate` | Copy a post (content, media, hashtags, same target accounts) as a new DRAFT. |
| `uiiq_social_post_publish` | PUBLISH a DRAFT, QUEUED or SCHEDULED post to every PENDING target now — Facebook/Instagram through IQEX, LinkedIn direct. |
| `uiiq_social_account_remove` | REMOVE a connected social account from the workspace (its stored tokens go with it; posts targeting it lose that target). |
| `uiiq_social_hashtag_groups` | The workspace's saved hashtag groups (name + hashtags). |
| `uiiq_social_hashtag_group_create` | Save a named hashtag group (leading # optional, at least one tag). |
| `uiiq_social_hashtag_group_update` | Rename a hashtag group or replace its hashtags. |
| `uiiq_social_hashtag_group_delete` | DELETE a hashtag group. |
| `uiiq_social_inbox` | Comments and messages received on the connected accounts (newest 100): filter unread (default) \| read \| archived \| all. |
| `uiiq_social_inbox_update` | Mark an inbox message read/unread and/or archived/unarchived. |
| `uiiq_social_settings` | The workspace's publishing mode: autoPublish (does a post go out by itself at its scheduled time, or wait for Publish — off by default) and minGapMinutes between automatic posts. |
| `uiiq_social_settings_update` | Set autoPublish and/or minGapMinutes (0-1440). |
| `uiiq_social_ai_config` | The IQEX form behind 'Write with AI' in the composer: formKey, formId, formUrl, label, the tenant, canGenerate, and — for an owner/admin who may write — a signed ctx token (1 hour) that lets IQEX generate and bill a post for this org. |

### Communications (press releases, journalists) — `src/tools/communications.js`

| Tool | What it does |
| --- | --- |
| `uiiq_press_release_list` | List press releases for the current tenant. |
| `uiiq_press_release_get` | Get a single press release by ID, including the full headline, body, notes to editors, distribution log, and embargo date. |
| `uiiq_press_release_create` | Create a new press release from a brief and trigger Chris (AI Communications Lead) to draft it. |
| `uiiq_press_release_update` | Update a press release body, headline, or notes to editors. |
| `uiiq_press_release_approve` | Approve a press release (must be in DRAFT status). |
| `uiiq_press_release_redraft` | Ask Chris (AI Communications Lead) to produce a new draft of the press release. |
| `uiiq_press_release_distribute` | Distribute an APPROVED press release. |
| `uiiq_journalist_contact_list` | List journalist contacts available to this tenant — includes global platform contacts (Grimsby Live, BBC Humberside, TechCrunch, etc.) plus any contacts the tenant has added. |
| `uiiq_journalist_contact_add` | Add a journalist contact for this tenant. |
| `uiiq_journalist_contact_update` | Edit one of the tenant's own journalist contacts: name, email, publication, beat, region, notes, isActive. |
| `uiiq_journalist_contact_delete` | Retire one of the tenant's own journalist contacts (soft delete: isActive false, so it drops out of distribution lists). |

### Grow (briefs) — `src/tools/grow.js`

| Tool | What it does |
| --- | --- |
| `uiiq_grow_campaign_brief_generate` | Generate channel-native ad copy for a marketing campaign across multiple ad networks in one call. |
| `uiiq_grow_brief_morning` | Fetch the latest UIIQ Grow Morning Brief — a daily AI-generated performance summary across all connected ad channels. |
| `uiiq_grow_brief_morning_generate` | Generate (or refresh) today's UIIQ Grow Morning Brief by calling the IQEX ads platform endpoint. |

### Pricing leads — `src/tools/pricing.js`

| Tool | What it does |
| --- | --- |
| `uiiq_price_list` | List the tenant's price items (the Pricing screen), 25 per page in name order. |
| `uiiq_pricing_leads_list` | List recent leads from the public pricing calculator (newest first, up to 200). |
| `uiiq_price_item_create` | Add a price item (what the workspace sells). |
| `uiiq_price_item_update` | Edit a price item: any of the create fields. |
| `uiiq_price_item_delete` | Delete a price item. |
| `uiiq_pricing_benchmark_update` | Edit a commercial pricing benchmark (a market price point the Pricing Intelligence recommendations draw on): category, region, scope, low/median/high pence, source title/URL/date, confidence, notes. |
| `uiiq_pricing_benchmark_delete` | Delete a commercial pricing benchmark. |

### SEO — `src/tools/seo.js`

| Tool | What it does |
| --- | --- |
| `uiiq_seo_audits` | List SEO audits for the tenant. |
| `uiiq_seo_audit` | Run an SEO audit for a URL. |
| `uiiq_seo_pagespeed` | Run a PageSpeed check for a URL. |
| `uiiq_seo_fix` | Apply/suggest a fix for an SEO audit finding. |
| `uiiq_seo_crawl` | Crawl the tenant's website and save an SEO + AIO audit (scores, issues, pages crawled). |

### Competitors — `src/tools/competitor.js`

Dashboard → Ads → Competitors. Needs the `ads_search` feature and the ads tier that includes competitors. Every competitor comes back with `adLibrary.activeUrl` / `allUrl` — links to their ads in Meta's public Ad Library for their market — and `adLibrary.exact`, true only when a Facebook Page ID pins the link to that advertiser rather than a keyword search on the name.

| Tool | What it does |
| --- | --- |
| `uiiq_competitor_list` | The tenant's tracked competitors, main ones first — each with its domains, profile and `adLibrary.activeUrl` / `allUrl` links to their live (or all) ads in Meta's Ad Library. |
| `uiiq_competitor_add` | Start tracking a competitor. |
| `uiiq_competitor_update` | Change a competitor's profile. |
| `uiiq_competitor_remove` | Stop tracking a competitor and all of its domains. |
| `uiiq_competitor_research` | A competitor's research: run history (each source as 'N found' or 'could not look' with the reason — an unreadable source is null, never zero), what changed since the previous run, the ads from the latest run that could read them, and the repeat cadence. |
| `uiiq_competitor_research_run` | Research a competitor now on IQEX (ads, Google results, keywords). |
| `uiiq_competitor_research_schedule` | How often IQEX re-researches a competitor on its own: WEEKLY, MONTHLY, or OFF. |
| `uiiq_competitor_signals` | Competitor watch hits (UiiQ #716): a rule such as 'tell me when their live ad count rises by 25/50/100/200%' fired on a research run. |
| `uiiq_competitor_signal_acknowledge` | Mark a competitor watch hit as seen: it leaves the Triggered panel and the brief. |
| `uiiq_competitor_watch_rule` | Set a competitor's watch rule: watchLiveAdsJumpPct = tell me when their live ad count rises by this % between research runs (25, 50, 100 or 200), null to switch it off. |
| `uiiq_admin_competitor_research_block` | SUPER_ADMIN only, not while impersonating: honour a business's objection to competitor research (Kim, LEGAL-DECISIONS-2026-09-22 s.5) across EVERY tenant. |

### Google (Ads, Analytics, Search Console) — `src/tools/google.js`

| Tool | What it does |
| --- | --- |
| `uiiq_google_analytics` | Google Analytics summary. |
| `uiiq_google_search_console` | Google Search Console keywords and pages for the last `days` days (default 30, max 365). |
| `uiiq_google_ads` | Google Ads campaigns, clicks and cost for the last `days` days (default 30, max 365), read through GA4. |
| `uiiq_google_properties` | The connected Google account (googleEmail), what is chosen (ga4PropertyId, gscSiteUrl) and what it can see: ga4Properties [{id, name}] and gscSites [{siteUrl, permissionLevel}]. |
| `uiiq_google_properties_set` | Choose the GA4 property (ga4PropertyId, e.g. |
| `uiiq_google_merchant_set` | Set (or clear, with no merchantId) the Google Merchant Center id on the tenant's Google connection. |
| `uiiq_google_disconnect` | DISCONNECT Google: revokes the tokens with Google and deletes the connection (GA4, Search Console, Ads and Merchant settings go with it). |

### Brains — `src/tools/brains.js`

| Tool | What it does |
| --- | --- |
| `uiiq_brains_list` | List the Office Brains available to this tenant. |
| `uiiq_brains_ask` | Ask an Office Brain a question. |
| `uiiq_brains_pulse` | The latest Pulse digest for a Brain (items + generatedAt) from IQEX. |
| `uiiq_brains_community_list` | The workspace's community questions for a Brain (latest 50) with their answers and the Brain's grounded auto-answer. |
| `uiiq_brains_community_ask` | Post a community question to a Brain. |
| `uiiq_brains_products` | Curated sector products for a Brain (catalogue products tagged with the Brain's sector; up to 60). |
| `uiiq_brains_tools_list` | Curated tools (links) for a Brain, in order, plus canManage for the caller. |
| `uiiq_brains_tool_add` | Add a curated tool (label + url, optional description, toolType default 'link', order) to a Brain. |
| `uiiq_brains_tool_remove` | Remove a curated tool from a Brain by its id. |
| `uiiq_brains_training` | A Brain's training courses with their modules (video + optional knowledge-check form), this user's progress per module, and canManage. |
| `uiiq_brains_training_progress` | Record this user's progress on a training module (status default 'completed'). |
| `uiiq_brains_course_create` | Create a training course on a Brain (title, description, order). |
| `uiiq_brains_module_create` | Add a module to a training course: title + videoRef (videoType default 'youtube'), optional order and knowledgeCheckFormId (an IQForm id). |
| `uiiq_brains_reviews` | Research a subject across the Brain's configured review sources (IQEX). |
| `uiiq_brains_sector_report` | Generate a full sector intelligence report over a Brain the workspace is entitled to (no prompt: IQEX reports across the whole Brain). |
| `uiiq_brains_analytics` | Per-Brain usage for this workspace: query count, community questions, training completions and the 8 most recent questions. |

### Boardroom — `src/tools/boardroom.js`

| Tool | What it does |
| --- | --- |
| `uiiq_boardroom_ask` | Ask a boardroom AI agent a single question (single-shot). |
| `uiiq_boardroom_sessions` | List your recent boardroom meeting sessions. |
| `uiiq_boardroom_start` | Start a new boardroom meeting session. |
| `uiiq_boardroom_message` | Send a message into a meeting session. |
| `uiiq_boardroom_agent_voice_get` | The ElevenLabs voice id configured for a boardroom agent in this workspace (null = the platform default). |
| `uiiq_boardroom_agent_voice_set` | Set (or clear with null) the ElevenLabs voice id a boardroom agent speaks with in this workspace. |
| `uiiq_boardroom_meeting_turn` | One agent's turn in a multi-agent meeting thread: pass the whole thread as messages [{ role:'user'\|'assistant', content, agentSlug?, agentName? }] and the agent answers in 2–4 sentences seeing every other member's contribution. |
| `uiiq_boardroom_tts` | Speak text in a boardroom agent's voice (agentSlug default quinn). |
| `uiiq_boardroom_tts_poll` | Poll a Chatterbox TTS job by assetId. |

### Agents — `src/tools/agents.js`

| Tool | What it does |
| --- | --- |
| `uiiq_agent_list` | List all Mastermind Team agents with their type, role, enabled status, and skill/reference counts. |
| `uiiq_agent_get` | Get full config for one agent by slug — includes all skills and references with their content. |
| `uiiq_agent_skill_get` | Get a specific skill's content for an agent. |
| `uiiq_agent_reference_get` | Get a specific reference document for an agent. |
| `uiiq_agent_sync` | Re-import every agent's skills and references (and model from index.md) from the AGENT-VAULT markdown on the server (AGENT_VAULT_ROOT). |
| `uiiq_agent_update` | Edit an agent's description, enabled flag or model (model null clears it). |
| `uiiq_agent_skill_create` | Add a skill (markdown content) to an agent; the name must be new for that agent. |
| `uiiq_agent_skill_update` | Edit a skill's name, description, content or enabled flag by its id. |
| `uiiq_agent_skill_delete` | Delete a skill from an agent. |
| `uiiq_agent_skill_evolve` | Propose an improved version of a skill: generates 8 eval scenarios, scores the current text, writes 3 rewrites (clarity / examples / failure-modes) and returns the best with before/after scores. |
| `uiiq_agent_reference_create` | Add a reference document (markdown) to an agent; the name must be new for that agent. |
| `uiiq_agent_reference_update` | Edit a reference's name or content by its id. |
| `uiiq_agent_reference_delete` | Delete a reference document from an agent. |

### Journeys (Make a Trail) — `src/tools/journey.js`

| Tool | What it does |
| --- | --- |
| `uiiq_journey_list` | List the Workshop catalogue for the signed-in user's tenant — the deliverable-action cards, each of which launches a journey via its journeySlug. |
| `uiiq_journey_start` | Start a Workshop journey run for the caller's tenant (e.g. |
| `uiiq_journey_status` | Get a journey run's status (read-only). |
| `uiiq_journey_ready` | Check whether a journey run's review checkpoint is ready to confirm — i.e. |
| `uiiq_journey_advance` | Advance a journey run: record the just-completed step's output, charge that step's credits to the org (IQEX-side), and return the next prefilled step — or { done: true, context } when finished. |
| `uiiq_journey_resume` | Mint a resume link for a journey run whose embedded form saved progress, and email it to the signed-in user. |

### Media Vault — `src/tools/media.js`

| Tool | What it does |
| --- | --- |
| `uiiq_media_list` | List the tenant's Media Vault (images and video, stored in IQEX). |
| `uiiq_media_upload` | Upload an image or video into the tenant's Media Vault from a local file path or a URL. |
| `uiiq_media_reframe` | Make ready-sized copies of one of the workspace's OWN images: square (1080, cards), landscape (1600×900, heroes), og (1200×630, link previews) and thumb (480). |
| `uiiq_media_derivatives` | The ready-sized copies already made for one image (target, url, webpUrl, width, height, bytes, format, status, method, untouched), from stored records only — nothing is fetched or made. |
| `uiiq_media_generate` | Generate an image or video with AI into the tenant's Media Vault (IQEX does the generating and charges the org's credits). |
| `uiiq_media_delete` | Delete an asset from the tenant's Media Vault permanently — cannot be undone. |
| `uiiq_media_presign` | Get a presigned S3 POST for a direct upload into the workspace's own UIIQ storage folder (uploads, logos, covers, experiences, thumbnails, causes, events, displays, social, staff) — the path the web app uses for logos, covers and social media, distinct from the IQEX Media Vault. |

### Documents — `src/tools/document.js`

| Tool | What it does |
| --- | --- |
| `uiiq_document_list` | List documents in the tenant's vault, newest first (up to 100). |
| `uiiq_document_get` | One vault document's record by id: name, description, category, type, size, date. |
| `uiiq_document_create` | Put a file into the tenant's Document Vault from a local path or a URL, and register it. |
| `uiiq_document_download` | Fetch a vault document's file to a local path and return that path. |
| `uiiq_document_delete` | Delete a vault document permanently. |

### Templates — `src/tools/template.js`

| Tool | What it does |
| --- | --- |
| `uiiq_template_list` | List email/campaign templates. |
| `uiiq_template_get` | Get a template by ID. |

### Menus — `src/tools/menu.js`

| Tool | What it does |
| --- | --- |
| `uiiq_menu_documents_list` | List the tenant's saved menu documents (id, name, kind, timestamps — no doc body). |
| `uiiq_menu_document_get` | Load one saved menu document including its doc body (format v2: layouts[] + linkedMenuId). |
| `uiiq_menu_document_update` | Update a saved menu document — rename and/or replace the doc body (e.g. |
| `uiiq_menu_document_delete` | Delete a saved menu document by id. |
| `uiiq_menu_build_live` | Create or refresh a LIVE menu from a designed menu's catalogue-linked products so one item set powers print, the menu boards and the till. |
| `uiiq_menu_products` | The tenant's catalogue products for placing onto a menu (id, name, pricePence, description, imageUrl, showInMenu, tillCategory; max 200). |
| `uiiq_menu_kit_generate` | Generate the F&B print kit for the tenant's live menu — IQEX batch-renders the print family (allergen card + shelf label per item + one table QR) from the products flagged Show-in-menu and charges the org pool per piece. |
| `uiiq_menu_backgrounds` | The tenant's IQEX image assets usable as a menu background (id, name, url). |
| `uiiq_menu_background_get` | One menu background as a base64 data URL (for embedding in a designed menu). |
| `uiiq_menu_categories` | The tenant's till categories — the distinct tillCategory values on active products, each with a product count and till button colour. |
| `uiiq_menu_category_update` | Rename a till category across every product carrying it (from → to) and/or set the till button colour for that group (tillColour, empty string clears). |
| `uiiq_menu_compose_extract` | Read an existing menu (PDF or PNG/JPEG/WEBP/GIF image) with AI and return its structure: sections[] with items (name, price in pounds, description). |
| `uiiq_menu_price_overlay_extract` | Read a photo/scan of a printed menu (PNG/JPEG/WEBP/GIF) with AI and return every priced item with its printed price and a suggested price position (x, y as 0–1 fractions) for the price-overlay designer. |
| `uiiq_menu_menus_list` | The tenant's menu areas (Diner, Playbarn …) with section counts. |
| `uiiq_menu_menu_create` | Create a menu area. |
| `uiiq_menu_menu_update` | Rename, reorder, describe or activate/deactivate a menu area. |
| `uiiq_menu_menu_delete` | DELETE a menu area. |
| `uiiq_menu_menu_placements` | Every placement across a menu area's sections (placement id, sectionId, productId, displayOrder, available, descriptionOverride, product summary). |
| `uiiq_menu_placement_add` | Place an existing catalogue product into one of a menu area's sections (flags the product showInMenu). |
| `uiiq_menu_sections_list` | The tenant's active menu sections with item counts, optionally for one menu area (menuId). |
| `uiiq_menu_section_create` | Create a section in a menu area (defaults to the tenant's Main Menu when menuId is omitted). |
| `uiiq_menu_section_update` | Update a section — name, description, availability window/days, image, displayOrder. |
| `uiiq_menu_section_delete` | Soft-delete a section. |
| `uiiq_menu_items_list` | Menu items (a product placed in a section: id = product id, plus placementId, sectionId, price, dietary, allergens, course, station, available), optionally for one section. |
| `uiiq_menu_item_create` | Create a menu product and place it in a section. |
| `uiiq_menu_item_update` | Update a menu item by product id — shared product fields (name, price, dietary, modifiers — modifierGroups replaces them all) and its placement (available, sectionId to move it). |
| `uiiq_menu_item_delete` | Soft-delete a menu product (active=false) — it leaves every menu, board and the till. |
| `uiiq_menu_placement_update` | Update one placement: reorder (displayOrder), 86 it (available=false) or override the description shown on this menu. |
| `uiiq_menu_placement_delete` | Remove a product from a menu section (deletes the placement; the product itself stays). |

### Legacy films — `src/tools/legacy.js`

| Tool | What it does |
| --- | --- |
| `uiiq_legacy_films_list` | List films in the UIIQ legacy film archive. |
| `uiiq_legacy_film_get` | Get a legacy film by ID. |
| `uiiq_legacy_film_renew` | Re-sign a legacy film's Bunny delivery URL (a fresh signed link and expiry, saved on the film). |
| `uiiq_legacy_bunny_settings_get` | The tenant's Bunny Stream settings for legacy film delivery: libraryId, pullZoneHost, playerCss, filmDeliveryBaseUrl, and whether the API key and token-auth key are set (the keys themselves are never returned). |
| `uiiq_legacy_bunny_settings_set` | Save (upsert) the tenant's Bunny Stream settings for legacy film delivery. |

### Materials — `src/tools/materials.js`

| Tool | What it does |
| --- | --- |
| `uiiq_materials_list` | List sourcing materials with candidate count, best landed cost, and watch status. |
| `uiiq_material_get` | Get a sourcing material with its candidates (compare table), price history, runs and watch. |
| `uiiq_material_create` | Create a material to source. |
| `uiiq_material_candidate_add` | Manually add a candidate supplier to a material. |
| `uiiq_material_discover` | Run AI supplier discovery for a material — returns candidate LEADS (not quotes) to verify. |
| `uiiq_material_candidate_status` | Set a candidate's status: SHORTLIST, REJECTED or NEW. |
| `uiiq_material_verify` | Mark a candidate as human-checked (verified) or clear it. |
| `uiiq_material_adopt` | Adopt a candidate as the supplier for a material — creates a RetailSupplier and moves the baseline to the adopted landed cost. |
| `uiiq_material_watch_set` | Create or update a price watch on a material (scheduled re-pricing + cheaper-supplier alert). |
| `uiiq_material_check_links` | Check whether each unverified supplier lead's link leads anywhere (28 Sep 2026: AI leads came back with websites that don't exist). |
| `uiiq_material_update` | Edit a material: name, unitLabel, targetQty, spec, currentSupplierName, currentUnitCostPence (the price to beat), currentSourceUrl (https), notes. |
| `uiiq_material_delete` | Delete a material and everything under it: its supplier leads, price history and price watch. |
| `uiiq_material_watch_remove` | Stop and remove the price watch on a material. |

### Merch sets — `src/tools/merch.js`

| Tool | What it does |
| --- | --- |
| `uiiq_merch_set_list` | List curated merch sets (super-admin). |
| `uiiq_merch_set_create` | Create a merch set (super-admin). |

### Commerce (hosted shops, fees, payouts) — `src/tools/commerce.js`

| Tool | What it does |
| --- | --- |
| `uiiq_commerce_price_breakdown` | Compute the platform/tenant fee split for a sale. |
| `uiiq_commerce_hosted_shop_list` | List StackCP-hosted tenant shops and their provisioning status. |
| `uiiq_commerce_hosted_shop_request` | Request a hosted shop for a tenant (creates the Site in REQUESTED). |
| `uiiq_commerce_hosted_shop_provision` | Run/advance provisioning for a hosted shop (mock provisioner until live wiring). |
| `uiiq_commerce_hosted_shop_go_live` | Take a provisioned hosted shop live. |
| `uiiq_commerce_payout_list` | List resell payouts owed to tenants. |
| `uiiq_commerce_payout_settle` | Settle a resell payout (transfer the tenant's share to their connected account). |
| `uiiq_commerce_fee_rates_get` | Get a tenant's fee rates (overrides + defaults + effective split). |
| `uiiq_commerce_fee_rates_set` | Set a tenant's fee rates. |
| `uiiq_commerce_assortment_list` | List a tenant's catalogue assortment (what they may resell). |
| `uiiq_commerce_assortment_add` | Add a catalogue product to a tenant's assortment. |
| `uiiq_commerce_assortment_remove` | Remove a product from a tenant's assortment. |
| `uiiq_commerce_catalogue` | Browse the shared catalogue. |

### Sales channels — `src/tools/channels.js`

| Tool | What it does |
| --- | --- |
| `uiiq_channels_connections` | List marketplace channel connections. |
| `uiiq_channels_connect` | Connect a marketplace channel (EBAY, AMAZON, GOOGLE_MERCHANT, TIKTOK, ETSY, FACEBOOK). |
| `uiiq_channels_disconnect` | Remove a channel connection by id. |
| `uiiq_channels_sync_status` | Product sync status across channels. |
| `uiiq_channels_sync` | Trigger a product sync for a channel connection. |
| `uiiq_channels_commission` | Channel commission summary. |

### Retail — `src/tools/retail.js`

| Tool | What it does |
| --- | --- |
| `uiiq_retail_products` | List retail products. |
| `uiiq_retail_product_get` | Get a retail product by ID. |
| `uiiq_retail_low_stock` | List retail products at or below their reorder point. |
| `uiiq_retail_reports` | Retail sales/stock report summary. |
| `uiiq_retail_suppliers` | List retail suppliers. |
| `uiiq_retail_shops` | List the tenant's connected WooCommerce stores (creds never returned). |
| `uiiq_retail_shop_sync` | Push the retail catalogue (products flagged Online Shop) to the connected WooCommerce store(s) — name, price, photo, barcode, stock, category. |
| `uiiq_retail_orders_pull` | Pull recent orders from the connected WooCommerce store(s) and decrement till stock for matched products (idempotent). |
| `uiiq_retail_stock_reasons` | List the tenant's managed stock-adjustment reasons (self-seeds defaults on first use). |
| `uiiq_retail_stock_reason_add` | Add a custom stock-adjustment reason. |
| `uiiq_retail_stock_reason_update` | Update a stock-adjustment reason by ID (label, direction IN\|OUT\|BOTH, active, displayOrder). |
| `uiiq_retail_stock_reason_delete` | Delete a custom stock-adjustment reason by ID. |
| `uiiq_retail_categories` | List the tenant's managed retail product categories. |
| `uiiq_retail_category_add` | Add a retail product category. |
| `uiiq_retail_category_update` | Update a retail category by ID (name — renames across every product using it; color; active; displayOrder). |
| `uiiq_retail_category_delete` | Delete a retail category by ID (products keep their existing category text). |
| `uiiq_retail_catalogue` | The tenant's listable catalogue: its visible assortment (the admin-curated / sector / branded set, not the whole shared catalogue), each with a suggested retail, the cost floor and the platform/tenant split. |
| `uiiq_retail_import` | Bulk create/update retail products from already-mapped rows (max 5000). |
| `uiiq_retail_labels` | The data to print labels / price tags for a set of products: name, price, barcode, sku, image. |
| `uiiq_retail_stock_movements` | A retail product's stock movement history (last 100: type, delta, balanceAfter, reason, when) with its current stockLevel and trackStock flag. |
| `uiiq_retail_stock_adjust` | Receive or adjust stock on a retail product. |
| `uiiq_retail_shop_listings` | The resold catalogue products listed on one of the tenant's connected shops: retail price, platform/tenant split, WooCommerce product id, last sync and any sync error. |
| `uiiq_retail_shop_listing_add` | List a catalogue product on one of the tenant's shops and PUSH it to WooCommerce. |
| `uiiq_retail_supplier_update` | Edit a retail (stock) supplier: name, contact details, payout notes, default consignment commission percent. |
| `uiiq_retail_supplier_delete` | Deactivate a retail supplier (soft delete: it drops out of the list; products keep their supplier link for provenance). |
| `uiiq_retail_supplier_statement` | What is owed to a consignment supplier: the unsettled entries (qty, gross, commission percent, supplier due) with a total, plus the all-time settled total. |
| `uiiq_retail_supplier_settle` | Mark ALL of a supplier's unsettled consignment entries as paid, stamping settledAt now and the optional settlementRef (e.g. |

### Till (device-authed) — `src/tools/till.js`

| Tool | What it does |
| --- | --- |
| `uiiq_till_catalog` | List the till catalog (device-scoped). |
| `uiiq_till_ping` | Till device heartbeat — confirm the device is registered and active. |
| `uiiq_till_verify_pin` | Start a staff session with a PIN. |
| `uiiq_till_payment_intent` | Create a card PaymentIntent on the tenant's connected account. |
| `uiiq_till_sale` | Ring up a till sale. |
| `uiiq_till_iqplant_plan_code` | The till scanned an IQPlant garden-plan code (the QR in the customer's email / on their phone). |
| `uiiq_till_outcome_code` | The till scanned an outcome code (garden plan today; bookings/briefs later). |
| `uiiq_till_gift_card_check` | Check a gift card code at the till before taking it as payment: { valid, remainingPence, originalPence, expiresAt } or { valid: false, reason }. |
| `uiiq_till_stripe_cancel` | Cancel an in-flight card PaymentIntent (cashier cancelled mid-tap, reader timed out). |
| `uiiq_till_stock_adjust` | Write off retail stock from the till (faulty, perished, damaged, wastage): reduces the product's stock level by qty and logs an ADJUSTMENT movement with the reason. |
| `uiiq_till_food_orders_list` | Open food orders (tabs) for the device's venue — everything not yet completed or cancelled, with table and live lines. |
| `uiiq_till_food_order_get` | One food order with its table and every line (including voided ones). |
| `uiiq_till_food_order_create` | Open a tab (optionally on a table) with one or more lines; fire=true sends it straight to the kitchen, otherwise it stays OPEN until fired. |
| `uiiq_till_food_order_update` | Change an open food order: action addItems (items), fire (send to kitchen), cancel (void the whole order), voidItem (itemId + reason — drops the line and its value, even if already sent), updateMeta (customerName/notes). |
| `uiiq_till_food_order_settle` | Close a tab at the till: records the payment(s) as a TillSale of MENU_ITEM lines, links it to the order and marks it PAID + COMPLETED. |
| `uiiq_till_table_floor` | The till's floor view: active tables with area, seats and the open order on each (or null). |
| `uiiq_till_pairing_code` | Mint a 6-character till pairing code (valid 15 minutes) for a new device to redeem with uiiq_till_register. |
| `uiiq_till_register` | Redeem a pairing code and register a new till device. |
| `uiiq_till_devices_list` | The tenant's registered till devices: name, active, platform, assigned menus (empty = all), last seen. |
| `uiiq_till_device_update` | Rename a till device, switch it on/off (active=false stops the till but keeps its sales), or set which menus it serves (menuIds; [] = all menus). |
| `uiiq_till_device_delete` | Permanently un-register a till device. |
| `uiiq_till_staff_list` | Till staff (cashiers and managers) with role, active, last used and any PIN lockout. |
| `uiiq_till_staff_create` | Add a till staff member with a PIN (CASHIER 4–8 digits, MANAGER 6–8 digits; a PIN already in use by active staff is refused). |
| `uiiq_till_daily_summary` | The daily sales summary for one day (default today): headline revenue, refunds, discounts, tax, transaction count, expected cash drawer; sales by item kind; cash movement by payment method. |
| `uiiq_till_day_close_list` | The last 30 till cash-ups (day closes): period, opening float, declared vs expected cash, variance, sales total, who closed. |
| `uiiq_till_day_close` | Cash up: records a day close for one device (deviceId) or the whole venue (omit it) — expected cash = opening float + CASH takings in the window, variance = declared − expected. |
| `uiiq_till_sale_refund` | Refund a PAID till sale: marks it REFUNDED (daily summary nets it off), reverses its COGS and puts retail stock back via RETURN movements. |
| `uiiq_till_payment_config_set` | Set up a till payment method for the venue (one row per provider): enabled on/off plus configJson — SUMUP {affiliateKey, appId?, merchantCode?, currency?}, STRIPE_TERMINAL / STRIPE_TAP_TO_PAY {locationId}; the others take no config. |
| `uiiq_till_kds_tickets` | Live kitchen tickets: orders fired to the kitchen and not yet served, oldest first, with their live lines; station narrows to one kitchen station. |
| `uiiq_till_kds_item_bump` | Bump a kitchen line forward (NEW→PREPARING→READY→SERVED) or set an explicit status; the parent order's status is recomputed from its lines. |
| `uiiq_till_table_list` | All the venue's tables (active or not) with label, area, seats, display order and QR token. |
| `uiiq_till_table_create` | Add a table; its customer-ordering QR token is generated for it (print it with uiiq_till_table_qr). |
| `uiiq_till_table_update` | Edit a table (label, area, seats, displayOrder, active) or rotateToken=true to issue a new QR token — the old printed QR stops working. |
| `uiiq_till_table_delete` | Delete a table. |
| `uiiq_till_table_qr` | Save a table's customer-ordering QR code (600px PNG encoding /order/<slug>/<token>) to a local file for printing. |

### IQPlant — `src/tools/iqplant.js`

| Tool | What it does |
| --- | --- |
| `uiiq_iqplant_garden_plan_list` | The tenant's delivered garden plans, newest first (up to 100): plan code, door (kiosk / home / voucher), level, total, stocked vs not-stocked line counts, the lead (contact — only when the customer consented) and the voucher the plan was sized to. |
| `uiiq_iqplant_stock_map_list` | The tenant's IQPlant stock mapping — every species slug mapped to a product / bay / size / tour spot — plus recommendedNotStocked: species the planner keeps recommending that have no mapping, most-seen first (the buying signal). |
| `uiiq_iqplant_stock_map_set` | Upsert one species mapping { slug, productId?, bay?, size?, tourSweep?, tourPoint? } — the whole row is replaced, so resend fields you want kept. |
| `uiiq_iqplant_stock_map_delete` | Remove a species mapping by slug. |

### Displays (IQDisplay) — `src/tools/displays.js`

| Tool | What it does |
| --- | --- |
| `uiiq_display_list` | List the tenant's displays (screens), each with its assigned channel and status. |
| `uiiq_display_create` | Register a display (screen). |
| `uiiq_display_update` | Edit a display. |
| `uiiq_display_delete` | Delete a display by id. |
| `uiiq_display_channel_list` | List channels (playlists), each with its ordered items. |
| `uiiq_display_channel_create` | Create a channel (playlist). |
| `uiiq_display_channel_update` | Edit a channel. |
| `uiiq_display_channel_delete` | Delete a channel by id. |
| `uiiq_display_channel_item_add` | Add an item to a channel. |
| `uiiq_display_channel_item_update` | Edit a channel item — reorder (order), change duration, or swap content_url. |
| `uiiq_display_channel_item_delete` | Remove an item from a channel. |
| `uiiq_display_group_list` | List display groups (venue/zone bundles of screens), each with its display_count. |
| `uiiq_display_group_create` | Create a display group (a named bundle of screens to schedule together). |
| `uiiq_display_schedule_list` | List schedules, each with its default_channel and ordered rules. |
| `uiiq_display_schedule_create` | Create a schedule. |
| `uiiq_display_schedule_rule_add` | Add a rule to a schedule: show `channel` during a time window, optionally limited to days of the week and a date range. |
| `uiiq_display_projects` | List the tenant's IQEX projects available to add to a channel (the PROJECT picker). |
| `uiiq_display_videos` | List the tenant's Bunny Stream signage videos (the picker behind the channel editor), each with its `ready` flag and `embedUrl`. |
| `uiiq_display_boards` | List the tenant's token boards (KPI / SHOWCASE / TARGETS / EVENT) with their public /board/<token> URL, config (a TARGETS board's config carries period and layout) and active flag. |
| `uiiq_display_board_create` | Mint a token board and optionally add it straight to a channel. |
| `uiiq_display_board_revoke` | Revoke a token board (active=false) so its /board/<token> URL 404s on the screen's next poll and the item goes dark — or re-enable it (active=true). |
| `uiiq_display_board_layout` | Change how a TARGETS board draws itself on the wall: lanes (a lane per company, the company total on the left, lines not yet trading in a 'coming up' strip), tiles (the original equal grid) or race (a column per company, every line a bar, sorted by need). |
| `uiiq_display_board_delete` | Delete a token board for good (revoking only darkens its URL; deleting removes the row — it cannot be undone). |
| `uiiq_display_channel_preview` | A channel's DRAFT playlist resolved exactly as a screen would receive it. |
| `uiiq_display_channel_publish` | PUBLISH a channel: freeze its current content as what screens play, so later edits stay draft until the next publish. |
| `uiiq_display_channel_unpublish` | Drop a channel's publish gate: edits go live on screens as they are made again. |
| `uiiq_display_group_update` | Rename a display group. |
| `uiiq_display_group_delete` | Delete a display group. |
| `uiiq_display_schedule_update` | Edit a schedule: rename, switch it on/off (active), or change the default channel shown when no rule matches (default_channel; null clears it). |
| `uiiq_display_schedule_delete` | Delete a schedule and its rules. |
| `uiiq_display_schedule_rule_update` | Edit one rule on a schedule — same fields as uiiq_display_schedule_rule_add (channel, days_of_week, start_time, end_time, date_start, date_end, priority); only the fields sent change. |
| `uiiq_display_schedule_rule_delete` | Remove a rule from a schedule. |

### Targets board — `src/tools/targets.js`

Every product's target against its actual, by week, month or fiscal year, coloured by pace. The targets are the business plan's revenue forecast; actuals come from each product's sources. Needs the tenant's `targets_board` feature; writes are admin-grade. Put it on a screen with `uiiq_display_board_create` kind `TARGETS`.

| Tool | What it does |
| --- | --- |
| `uiiq_targets_board` | The targets board as the signed-in dashboard sees it: tiles grouped by company, each with target, expected-by-today, actual, % of pace and a state (EXCEEDING / CLOSE / BEHIND / NOT_STARTED / PRE_LAUNCH 'Launches <month>' / IN_RND / NO_TARGET / NO_DATA '?' = no working feed), plus company and overall totals. |
| `uiiq_targets_streams` | Every product line (revenue stream) on the tenant's business plan with its board settings — onBoard, boardLabel, groupLabel (company), measure (REVENUE / FEE_INCOME / UNITS), colour, position, stage (null = live, NOT_LAUNCHED, RND), launchMonth — this fiscal year's target in pence, and its sources with their health (lastSuccessAt / lastError; secrets never included). |
| `uiiq_targets_stream_create` | Add a product line to the tenant's business plan (creating the plan if it has none); it goes on the board. |
| `uiiq_targets_stream_update` | Change one product line's board settings. |
| `uiiq_targets_manual_figure` | Type an actual figure into a MANUAL ('Entered by hand') source. |
| `uiiq_targets_source_add` | Add where a product line's actual comes from. |
| `uiiq_targets_source_update` | Rename a source, change its settings, or pause / resume it (`active`). |
| `uiiq_targets_source_remove` | Remove a source AND every daily figure it recorded (cannot be undone). |
| `uiiq_targets_history_upload` | Upload PAST monthly figures from the accounts for an existing business, so the board has last year for real. |
| `uiiq_targets_source_test` | The 'Test' button: read yesterday's and today's figure from a source WITHOUT storing anything, to prove a feed works before it feeds the screen. |

### Billing — `src/tools/billing.js`

| Tool | What it does |
| --- | --- |
| `uiiq_billing_info` | Get the tenant's billing information (plan, status, balance). |
| `uiiq_billing_invoices` | List the tenant's invoices. |
| `uiiq_billing_usage` | The tenant's live 'My Plan & Usage' statement: this month's plan base, accruing credit overage (billed in arrears), and the platform fee already collected off sales (GMV) — plus the all-in cost this period and any active discount deal. |
| `uiiq_billing_override_get` | List a tenant's per-tenant billing overrides (discount deals, newest first) plus the cost floor and list credit rate for the UI. |
| `uiiq_billing_override_set` | Add a dated per-tenant billing override (discount deal). |
| `uiiq_billing_override_clear` | Deactivate a tenant's billing override(s) — reverting to list pricing and tearing down any Stripe base-%-off coupon. |
| `uiiq_billing_tiers` | The subscription sizes this tenant can buy (only sizes with a Stripe price configured): tier START\|GROW\|SCALE, basePence, monthlyCredits, platformFeePct — plus the tenant's currentTier. |
| `uiiq_billing_estimate` | The 'right-size' what-if: this month's real usage priced across every plan size at list price, and the cheapest size that fits. |
| `uiiq_billing_checkout` | Start a paid UIIQ subscription (trial → paid): creates a Stripe Checkout session and RETURNS A CHECKOUT URL for a person to open and pay — nothing is charged until they complete it. |
| `uiiq_billing_portal` | Open the Stripe customer billing portal: RETURNS A URL where the tenant can change card, view invoices or cancel. |

### Credits — `src/tools/credits.js`

| Tool | What it does |
| --- | --- |
| `uiiq_credits_balance` | Get the tenant's credit balance and this month's usage. |
| `uiiq_credits_ledger` | Get the tenant's full credit picture from the IQEX ledger: balance, recent transactions, and the purchasable credit packs. |
| `uiiq_credits_checkout` | Start a credit top-up: asks IQEX (which owns credit purchasing) for a Stripe Checkout session for one of the packs in uiiq_credits_ledger and RETURNS A CHECKOUT URL for a person to open and pay — nothing is charged until they complete it. |

### Costs — `src/tools/costs.js`

| Tool | What it does |
| --- | --- |
| `uiiq_costs_summary` | Spend summary + gross margin for a period. |
| `uiiq_costs_categories` | List the tenant's cost categories (HMRC-aligned managed list). |
| `uiiq_costs_centers` | List the tenant's cost centres (departments/sites). |
| `uiiq_costs_bills` | List/filter cost bills. |
| `uiiq_costs_bill_add` | Record a cost bill. |
| `uiiq_costs_bill_allocations_get` | A bill's cost-centre split. |
| `uiiq_costs_bill_allocations_set` | Replace a bill's cost-centre split. |
| `uiiq_costs_period_lock_list` | List every cost period lock (active and unlocked, newest first). |
| `uiiq_costs_period_lock_create` | Lock a cost period so its bills can no longer be changed (mutations return 423). |
| `uiiq_costs_period_lock_toggle` | Unlock (active=false) or re-lock (active=true) a period lock by id; optionally update the reason. |
| `uiiq_costs_settings_get` | The tenant's cost settings — VAT scheme (STANDARD \| FLAT_RATE \| NOT_REGISTERED), flatRatePct, vatRegistered. |
| `uiiq_costs_settings_set` | Set the tenant's VAT scheme and/or flat-rate percentage. |
| `uiiq_costs_recurring` | List recurring cost templates (rent, broadband, electricity…). |
| `uiiq_costs_recurring_generate` | Generate any due bills from the recurring cost templates (idempotent). |
| `uiiq_costs_kpi_roll` | Roll a month's cost/margin actuals into the plan's KpiActual (idempotent). |
| `uiiq_costs_bill_get` | One cost bill with its category, cost centre, supplier, venue, payments and cost-centre allocations. |
| `uiiq_costs_bill_update` | Edit a manually-entered cost bill (integer pence; gross is recomputed when net/vat change). |
| `uiiq_costs_bill_void` | VOID a cost bill (kept for audit, excluded from totals — there is no hard delete). |
| `uiiq_costs_category_add` | Add a custom cost category. |
| `uiiq_costs_category_update` | Rename / regroup / reorder / (de)activate a cost category, or map it to a plan forecast line (planExpenseCategoryId / planDirectCostId; empty string unmaps). |
| `uiiq_costs_category_delete` | Delete a custom cost category. |
| `uiiq_costs_center_add` | Add a cost centre (department / site). |
| `uiiq_costs_center_update` | Rename / recode / reorder / (de)activate a cost centre. |
| `uiiq_costs_center_delete` | Delete a cost centre. |
| `uiiq_costs_recurring_add` | Add a recurring cost template (rent, broadband…). |
| `uiiq_costs_recurring_update` | Edit a recurring cost template's amount, schedule, payee or active flag. |
| `uiiq_costs_recurring_delete` | DELETE a recurring cost template. |
| `uiiq_costs_xero_status` | Is Xero connected for cost import, when it last synced, how many accounts are mapped and how many bills came from it. |
| `uiiq_costs_xero_accounts` | The Xero EXPENSE accounts alongside the tenant's cost categories/centres and the current account→category mapping. |
| `uiiq_costs_xero_mapping_set` | Save the Xero account→cost-category mapping: byCode = { [xeroAccountCode]: costCategoryId }, optional defaultCategoryId and costCenterId for imported bills. |
| `uiiq_costs_xero_pull_preview` | PREVIEW the Xero ACCPAY bills in a range (default last 90 days) without writing: each candidate flagged alreadyImported / possibleManualDuplicate / unmapped, plus a summary. |
| `uiiq_costs_xero_pull_import` | IMPORT Xero bills as UIIQ cost bills (source XERO, read-only afterwards). |

### Business plan — `src/tools/plan.js`

| Tool | What it does |
| --- | --- |
| `uiiq_plan_estimates` | Business plan — revenue estimates & projections (from the P&L statements). |
| `uiiq_plan_revenue` | Business plan — planned vs actual revenue breakdown. |
| `uiiq_plan_expenses` | Business plan — expense categories and totals. |
| `uiiq_plan_milestones` | Business plan — milestones. |
| `uiiq_plan_personnel` | Business plan — team headcount and cost plan. |
| `uiiq_plan_statements` | Business plan — profit & loss statements. |
| `uiiq_plan_assets` | Business plan — asset register (capital items with purchase cost/month and useful life; the targets for capital-bill linking in cost tracking). |
| `uiiq_plan_revenue_from_actuals` | Start a fiscal year of the revenue forecast from actuals: each product's month = the targets board's actual for the same month a year earlier × (1 + upliftPct/100), rounded. |
| `uiiq_plan_get` | The tenant's BusinessPlan row ({ plan: null } when none has been created yet). |
| `uiiq_plan_create` | Get-or-create the tenant's BusinessPlan, seeding the document sections and idea-canvas entries. |
| `uiiq_plan_document_get` | One written section of the plan document (content + status). |
| `uiiq_plan_document_update` | Write a plan document section's content and/or status (NOT_STARTED \| IN_PROGRESS \| READY). |
| `uiiq_plan_canvas_get` | One idea-canvas box (items, summary, status). |
| `uiiq_plan_canvas_update` | Set an idea-canvas box's items (array of strings), summary and/or status. |
| `uiiq_plan_direct_costs` | Business plan — direct-cost (COGS) forecast lines, each with monthlyData { 'YYYY-MM': pence } or a percent of revenue. |
| `uiiq_plan_direct_cost_add` | Add a direct-cost (COGS) forecast line. |
| `uiiq_plan_direct_cost_update` | Edit a direct-cost forecast line (name, monthlyData, percent-of-revenue, assumptions). |
| `uiiq_plan_direct_cost_delete` | DELETE a direct-cost forecast line. |
| `uiiq_plan_expense_update` | Edit an expense forecast line (see uiiq_plan_expenses): name, category, frequency MONTHLY\|QUARTERLY\|ANNUALLY\|ONE_OFF, monthlyData { 'YYYY-MM': pence } (replaces the map), assumptions. |
| `uiiq_plan_expense_delete` | DELETE an expense forecast line. |
| `uiiq_plan_personnel_update` | Edit a personnel plan entry (see uiiq_plan_personnel): jobTitle, department, headcount, annualSalary, startMonth/endMonth (YYYY-MM), burdenRate, assumptions. |
| `uiiq_plan_personnel_delete` | DELETE a personnel plan entry. |
| `uiiq_plan_asset_delete` | DELETE an asset register entry (see uiiq_plan_assets). |
| `uiiq_plan_milestone_update` | Edit a plan milestone (see uiiq_plan_milestones): name, description, dueDate (ISO; empty clears), status NOT_STARTED\|IN_PROGRESS\|COMPLETE\|CANCELLED, category. |
| `uiiq_plan_milestone_delete` | DELETE a plan milestone. |
| `uiiq_plan_idea_add` | Add a product or service idea to the plan's ideas workbench. |
| `uiiq_plan_idea_get` | One product/service idea with its full viability worksheet (costs, pricing, demand, break-even, score, decision). |
| `uiiq_plan_idea_update` | Update any worksheet fields of an idea. |
| `uiiq_plan_idea_delete` | DELETE a product/service idea and its worksheet. |
| `uiiq_plan_proposal_template_add` | Create a commercial proposal template (cover title, intro, terms, footer, accent colour, logo). |
| `uiiq_plan_proposal_template_update` | Edit a commercial proposal template. |
| `uiiq_plan_proposal_template_delete` | DELETE a commercial proposal template. |
| `uiiq_plan_planning_item_get` | One planning-calendar item (type SOCIAL\|EVENT\|CONTENT\|TASK, dates, status, assignee, tags, colour, metadata). |
| `uiiq_plan_planning_item_update` | Edit a planning-calendar item: title, description, type SOCIAL\|EVENT\|CONTENT\|TASK, startDate/endDate (ISO), allDay, status PLANNED\|IN_PROGRESS\|COMPLETED\|CANCELLED, assignee, tags, colour, metadata. |
| `uiiq_plan_planning_item_delete` | DELETE a planning-calendar item. |

### Reports — `src/tools/report.js`

| Tool | What it does |
| --- | --- |
| `uiiq_report_revenue` | Get UIIQ revenue report. |
| `uiiq_report_usage` | Get UIIQ platform usage stats (sends, contacts, workflows). |
| `uiiq_report_vat` | VAT summary for a period (default: this quarter to date) from the VAT snapshots on platform sales — till sales + online food orders, de-duplicated — per rate and in total, with the tenant's VAT registration and a rolling-12-month turnover check against the £90k threshold (ok \| approaching \| over). |

### HR — `src/tools/hr.js`

| Tool | What it does |
| --- | --- |
| `uiiq_hr_staff_list` | List HR staff records: id, name, job title, department, employment type, status and leaving date (no pay or contact details). status active (default), inactive or all. |
| `uiiq_hr_staff_get` | One HR staff record in full. An owner/admin can read anyone's; anyone else only their own. |
| `uiiq_hr_staff_create` | Add an HR staff record (firstName, lastName, email, startDate required; annualSalary in pounds). |
| `uiiq_hr_staff_update` | Edit an HR staff record — only the fields you send change; audited, with pay, notes and personal details recorded as changed without values. |
| `uiiq_hr_staff_deactivate` | Deactivate someone who is leaving: INACTIVE plus their leaving date; off rotas and pickers, no new work, badge invalid; optionally disables their till PIN, hides their Venue Staff profile and (removeAccess) removes their access to this workspace. |
| `uiiq_hr_staff_reactivate` | Reactivate a deactivated staff record: ACTIVE, leaving date cleared. |
| `uiiq_hr_timesheet_list` | List UIIQ timesheet entries. |
| `uiiq_hr_timesheet_approve` | Approve or reject a UIIQ timesheet entry by ID. |
| `uiiq_hr_clockin_list` | List UIIQ QR clock-in records. |
| `uiiq_hr_leave_list` | List UIIQ leave requests. |
| `uiiq_hr_leave_approve` | Approve or reject a UIIQ leave request. |
| `uiiq_hr_payroll_run` | Fetch the monthly UIIQ Run pay-run for a given month (defaults to current). |
| `uiiq_hr_payroll_export_url` | Returns the URL to download a UIIQ Run pay-run as CSV for the given month. |
| `uiiq_hr_timesheet_from_session` | Raise a timesheet line straight from a class register session: the class supplies the teacher, start time and duration. |
| `uiiq_hr_onboarding_step_complete` | Mark an onboarding step complete (by step id). |
| `uiiq_hr_scan_tag_update` | Edit a QR clock-in tag: name, description, taskId, active, radiusMeters (5–5000). |
| `uiiq_hr_scan_tag_delete` | Delete a QR clock-in tag. |
| `uiiq_hr_scan_tag_qr` | Save a clock-in tag's QR code as an SVG (320px, points at the app's /scan/<code> page) and return the path. |
| `uiiq_hr_shift_list` | The rota for one week: active staff, their shifts keyed by staff id then YYYY-MM-DD, and weekly minutes per person. |
| `uiiq_hr_shift_set` | Put a staff member on the rota for a day (one shift per person per day — an existing shift on that date is overwritten). |
| `uiiq_hr_shift_update` | Change a shift's times (HH:MM), break or notes by shift id. |
| `uiiq_hr_shift_delete` | Take a shift off the rota by shift id. |
| `uiiq_hr_teacher_month` | The Teacher month view: per teaching staff member, every class session (with cancellations and cover applied), rota shift, workshop booking and venue in the month. |
| `uiiq_hr_staff_badge_get` | The staff member's current ID-badge code (what the badge page carries — treat it like a key), with issued/revoked dates. |
| `uiiq_hr_staff_badge_issue` | Issue a staff member's ID-badge code, or REPLACE the existing one — the old badge page stops working at once. |
| `uiiq_hr_staff_badge_revoke` | Revoke a staff member's ID badge: the badge page says 'no longer valid' on the next scan. |
| `uiiq_hr_staff_document_list` | A staff member's compliance documents. |
| `uiiq_hr_staff_document_add` | Attach a compliance document to a staff member: either a local file (path — PDF, JPEG, PNG or WebP, 15 MB max; uploaded to the private bucket via presign) or an external link (fileUrl). |
| `uiiq_hr_staff_document_download` | Fetch a staff document's file to a local path and return it. |
| `uiiq_hr_staff_document_delete` | Delete a staff document and its stored file. |
| `uiiq_hr_pay_rate_list` | A staff member's whole rate card, newest first, retired rows included (they are what past runs paid). |
| `uiiq_hr_pay_rate_add` | Add a rate to a staff member's rate card. |
| `uiiq_hr_pay_rate_update` | Edit one rate-card line. |
| `uiiq_hr_pay_rate_delete` | Delete a rate-card line that has NOT started yet. |
| `uiiq_hr_training_matrix` | The training matrix in one payload: active courses, active staff, every training record (with certificate presence) and the role → required-course map. |
| `uiiq_hr_training_export` | The training matrix as an audit-pack CSV (one row per staff × course that is required or recorded). |
| `uiiq_hr_training_record_set` | Log or update a staff member's training record for a course (one row per staff × course; a second call overwrites). |
| `uiiq_hr_training_record_delete` | Delete a training record outright — only for one logged in error; prefer status EXEMPT so the history stays traceable. |
| `uiiq_hr_training_certificate_download` | Fetch a training record's certificate to a local path and return it (signed link, ~2 minutes, followed once). |
| `uiiq_hr_workshop_list` | Workshop bookings. |
| `uiiq_hr_workshop_get` | One workshop booking. |
| `uiiq_hr_workshop_fee_suggest` | What the teacher's rate card says a workshop slot is worth (amount, rate, basis), plus a clash warning for the same slot. |
| `uiiq_hr_workshop_create` | Book a teacher onto a workshop. |
| `uiiq_hr_workshop_update` | Edit a workshop booking; moving the date or teacher re-runs the fee suggestion. |
| `uiiq_hr_workshop_delete` | Remove a workshop booking. |
| `uiiq_hr_workshop_accept` | Accept (default) or decline a workshop booking. |
| `uiiq_hr_workshop_contract` | Generate the workshop contract PDF into the teacher's documents (visibility OWNER_ONLY) and move a DRAFT booking to SENT. |
| `uiiq_hr_workshop_fund` | Charge the workshop's cost to a funding heading (a PAYROLL-type allocation in the Funding Tracker). |
| `uiiq_hr_workshop_timesheet` | Raise the pay-run timesheet line for a COMPLETED workshop (billable, tagged 'workshop'). |

### Automations — `src/tools/automation.js`

| Tool | What it does |
| --- | --- |
| `uiiq_automation_list` | List UIIQ automations. |
| `uiiq_automation_toggle` | Enable or disable a UIIQ automation by ID. |
| `uiiq_campaign_list` | List UIIQ email/SMS campaigns. |
| `uiiq_workflow_list` | List UIIQ workflow templates. |
| `uiiq_workflow_instances` | List active UIIQ workflow instances. |
| `uiiq_workflow_trigger` | Trigger a new UIIQ workflow instance from a template. |
| `uiiq_automation_get` | Get one UIIQ automation: name, status, trigger, steps, stats and its last 50 runs (status, current step, contact). |
| `uiiq_automation_update` | Edit an automation. |
| `uiiq_automation_delete` | Delete an automation and its run history. |
| `uiiq_workflow_packs` | List the operational task template packs available (built-in industry packs plus global packs from the database): id, name, industry, taskCount, isBuiltIn. |

### Ads & Search — `src/tools/ads.js`

| Tool | What it does |
|---|---|
| `uiiq_ads_overview` | The Ads & Search overview: spend, results and status per channel, keyword ranks, local pack, reviews. |
| `uiiq_ads_advert_briefs` | The workspace's guided Ad-Brief adverts (channel + generated copy) from IQEX. |
| `uiiq_ads_diagram_start` | Start a diagram from text (Napkin, via IQEX): content = the text to draw, context = what it is for, numberOfVisuals 1 or 2, format svg (default) or png. |
| `uiiq_ads_diagram_poll` | Check on a diagram with the requestId and token from uiiq_ads_diagram_start (name = what to file it as). |
| `uiiq_ads_keyword_research` | Keyword ideas from seed terms (IQEX keyword research): volume, competition, suggested bids. |
| `uiiq_ads_keyword_track` | Track a keyword's rank for the workspace (optionally for one target URL). |
| `uiiq_ads_keyword_untrack` | Stop tracking a keyword (by its id from the overview). |
| `uiiq_ads_keyword_gap` | Keywords a competitor's domain ranks for that we don't. |
| `uiiq_ads_local` | The workspace's local-search state: the Google Business profile, tracked local keywords and their map-pack positions, recent reviews. |
| `uiiq_ads_local_pack` | Who is in the Google map pack for a keyword near a postcode, right now. |
| `uiiq_ads_local_keywords` | The local keywords (keyword + postcode) the workspace tracks in the map pack. |
| `uiiq_ads_local_keyword_track` | Track a keyword's map-pack position near a postcode. |
| `uiiq_ads_local_keyword_untrack` | Stop tracking a local keyword (by id). |
| `uiiq_ads_local_competitors` | Nearby businesses in a category around a postcode, compared with our own name / reviews / rating / photo count when given. |
| `uiiq_ads_youtube_search` | Search YouTube for a query (research: what already ranks). |
| `uiiq_ads_youtube_channels` | Stats for YouTube channels by id (subscribers, views, uploads). |
| `uiiq_ads_youtube_intel` | YouTube intelligence for a topic in a region: top channels, formats and titles that work. |
| `uiiq_ads_video_capabilities` | The text-to-video engines and what each accepts (aspect ratios × durations). |
| `uiiq_ads_video_profiles` | The organisation, service and object profiles on IQEX an advert can be grounded in (their ids go to generate / ai-assist). |
| `uiiq_ads_video_ai_assist` | Turn a rough brief into a script, key message, CTA and visual style for an advert, grounded in the profiles given. |
| `uiiq_ads_video_generate` | Generate an advert video on an engine (topview, runway, wan) from a grounded brief. |
| `uiiq_ads_video_get` | An advert video asset with its render status (asked of IQEX), master URL when ready, platform variants, SEO copy and approval state. |
| `uiiq_ads_video_seo_set` | Set a video's SEO copy by hand: seoTitle, seoDescription, seoTags. |
| `uiiq_ads_video_delete` | Delete an advert video asset. |
| `uiiq_ads_video_seo_generate` | Generate SEO title, description and tags for a video for one platform (default youtube) from its brief. |
| `uiiq_ads_video_thumbnails_generate` | Start generating thumbnail variants for a video from its brief. |
| `uiiq_ads_video_thumbnail_status` | Poll one thumbnail generation: { status, urls }. |
| `uiiq_ads_video_thumbnails_set` | Save the chosen thumbnail variants on a video (the array from generate/status, edited). |
| `uiiq_ads_video_approve` | Approve a video (queues organic posts on the given platforms, or the brief's) or reject it with a note. |
| `uiiq_ads_video_publish` | Publish an approved video as organic posts on platforms the workspace has connected (uiiq_social_accounts). |
| `uiiq_ads_video_publish_paid` | Submit a finished video to the paid campaign managers for the platforms given. |
| `uiiq_ads_google_campaign_control` | Pause or enable a Google Ads campaign, or set its daily budget (budgetMicros = pounds × 1,000,000). |
| `uiiq_ads_pinterest_alert_dismiss` | Dismiss a Pinterest trend alert (from the overview). |
| `uiiq_ads_review_draft_reply` | Draft a reply to a Google review (by the review's id from uiiq_ads_local) in the workspace's voice. |

### Postroom — `src/tools/postroom.js`

| Tool | What it does |
|---|---|
| `uiiq_postroom_list` | The Postroom board: every open parcel (Waiting on product, Waiting on stock, Ready to pack, Label printed) plus the last week's dispatched, with the pick list against My Retail stock and the postage check. |
| `uiiq_postroom_product_ready` | Waiting on product → Ready to pack, by hand: the product is made (a DTF print finished, or a print-ready signal that never arrived). |
| `uiiq_postroom_label_printed` | Ready to pack → Label printed. |
| `uiiq_postroom_dispatch` | Mark a parcel dispatched. |
| `uiiq_postroom_reopen` | Dispatched → Label printed: dispatch was pressed by mistake. |
| `uiiq_postroom_tell_shop` | A dispatched parcel whose shop was not told (the write-back failed): try again. |
| `uiiq_postroom_correct` | Correct a parcel before it goes: the address (any of shipName, shipCompany, shipPhone, shipAddress1, shipAddress2, shipCity, shipPostcode, shipCountry — blank clears), service, weightGrams, trackingNumber, postagePaid. |
| `uiiq_postroom_add_recent` | 'Add recent orders': make parcels for shop orders from the last N hours that have none, because they arrived before Postroom was switched on. |
| `uiiq_postroom_settings` | Postroom settings: the return address printed on every label (null = the workspace's own address), what a label prints now, and the reorder-task board. |
| `uiiq_postroom_settings_update` | Set the return address (one line per array entry, at most 7; empty = the workspace's own address) and/or the board that reorder tasks go on (taskBoardId, null = none). |
| `uiiq_postroom_forwarding_address_update` | Edit a saved mail forwarding address (label, address lines, city, postcode, country). |
| `uiiq_postroom_forwarding_address_delete` | Delete a saved mail forwarding address. |
| `uiiq_postroom_hq_request_status` | This workspace's Postroom HQ request (status, code, who accepted, re-acceptance needed), whether it may request, and the terms. Requesting is a click in UiiQ only. |
| `uiiq_postroom_hq_request_withdraw` | Withdraw the request: it ends and Show in Postroom HQ switches off at once. OWNER/ADMIN, not while impersonating. |
| `uiiq_postroom_hq_log` | This workspace's Postroom HQ log for 12 months (views, prints, actions, request steps; never an address), json or csv. OWNER/ADMIN. |
| `uiiq_admin_postroom_hq_request_status` | A tenant's Postroom HQ request as the shop sees it, plus groupCompany. Raising one and setting group company are admin-UI clicks only. SUPER_ADMIN. |
| `uiiq_admin_postroom_hq_request_withdraw` | Record a withdrawal (Kim D.5): the tenant asked (channel email/letter/phone/in_person, with `requester_name`, `requester_role` and `message_ref`), or `our_decision` (with a `reason`; not until UiiQ-platform #761 is live); `received_at` always. Values are trimmed; fields that don't apply to the channel are reported as ignored. HQ switches off at once and the owners are emailed. SUPER_ADMIN. |
| `uiiq_admin_postroom_hq_log` | One tenant's Postroom HQ log, json or csv, to send them on request. SUPER_ADMIN. |
| `uiiq_admin_postroom_board` | Postroom HQ (SUPER_ADMIN): every tenant with Postroom, "Show in Postroom HQ" on and an ACTIVE request (its code on each), each with its own board; `tenantId` narrows to one. |
| `uiiq_admin_postroom_action` | Postroom HQ: product_ready / label_printed / dispatch / reopen / tell_shop / correct on any tenant's parcel, in the shipment's own tenant. Audited. |

### Appeals — `src/tools/appeals.js`

| Tool | What it does |
|---|---|
| `uiiq_appeal_list` | The workspace's appeals, every status, with raised so far. |
| `uiiq_appeal_get` | One appeal with progress, match pledges and updates. |
| `uiiq_appeal_create` | A draft appeal on one of the workspace's causes (uiiq_donations_causes_list). |
| `uiiq_appeal_update` | Edit an appeal: any of closesAt, opensAt, targetPence, story, videoUrl, gallery. |
| `uiiq_appeal_delete` | Delete a draft appeal that has no gifts. |
| `uiiq_appeal_publish` | Publish an appeal (owner/admin). |
| `uiiq_appeal_pledge_add` | Record a sponsor's match-funding pledge (recorded, not charged through us). |
| `uiiq_appeal_pledge_update` | Edit a pledge, or move it PROMISED → RECEIVED / WITHDRAWN. |
| `uiiq_appeal_pledge_delete` | Delete a pledge on a draft appeal. |
| `uiiq_appeal_supporters` | The people behind an appeal's gifts. |
| `uiiq_appeal_update_add` | A news update on an appeal: title and body, optional imageUrl (https, own bucket). |
| `uiiq_appeal_update_edit` | Edit an update; publish: true shows it, false hides it. |
| `uiiq_appeal_update_delete` | Delete an update. |
| `uiiq_appeal_update_email` | Email a published update, once, to the supporters who asked for updates when they gave (owner/admin). |
| `uiiq_admin_appeal_suspend` | SUPER_ADMIN only, not while impersonating: suspend an appeal at once (stops gifts, shows a neutral 'paused' notice — the takedown duty under the Code of Fundraising Practice) with a reason, or lift a suspension with suspend: false. |

### Auctions — `src/tools/auctions.js`

| Tool | What it does |
|---|---|
| `uiiq_auction_list` | The workspace's auctions, every status. |
| `uiiq_auction_get` | The seller's live view of one auction: its lots, current bids, status. |
| `uiiq_auction_create` | A draft auction. |
| `uiiq_auction_update` | Edit an auction's title, description, opensAt or closesAt, or change its state with action: 'publish' (in front of buyers) or 'cancel'. |
| `uiiq_auction_lot_add` | Add a lot (quantity 1). |
| `uiiq_auction_lot_bids` | A lot's bid history. |
| `uiiq_auction_lot_update` | Edit a lot (title, description, attributes, mediaRefs, startPence, reservePence, buyNowPence) or withdraw it with action: 'withdraw' (owner/admin). |
| `uiiq_auction_settings` | The workspace's auction defaults that new auctions copy: the increment ladder, softCloseSeconds, buyNowAllowed, currency, maxBidPence. |
| `uiiq_auction_settings_update` | Change the defaults (owner/admin). |

### NX2U live streaming — `src/tools/nx2u.js`

| Tool | What it does |
|---|---|
| `uiiq_nx2u_channel_list` | The tenant's NX2U channels (each a public face at its own URL) with event counts. |
| `uiiq_nx2u_channel_create` | A new channel (owner/admin). |
| `uiiq_nx2u_channel_update` | Edit a channel's name, slug, visibility, defaultAccess or branding (owner/admin). |
| `uiiq_nx2u_channel_delete` | Delete a channel (owner/admin). |
| `uiiq_nx2u_event_list` | The tenant's events, newest first, optionally one channel's. |
| `uiiq_nx2u_event_get` | The control room's view of one event: the provider is asked, so status and viewers are live. |
| `uiiq_nx2u_event_create` | A new event. |
| `uiiq_nx2u_event_update` | Edit an event: title, kind, scheduledStart, scheduledEnd, access, tier, replayDays, licenceRef. |
| `uiiq_nx2u_event_provision` | Create the stream on the provider and return the encoder settings, KEY INCLUDED (owner/admin; audit-logged). |
| `uiiq_nx2u_event_ingest` | Show the encoder settings (with the key) again for a provisioned event. |
| `uiiq_nx2u_event_pin_rotate` | A new PIN for a PIN-protected event, returned once; the old one stops working at once, so the family needs the new link. |
| `uiiq_nx2u_event_segments_set` | Replace an event's running order. |
| `uiiq_nx2u_event_segment_mark` | The control room's big buttons: this part is on now (start), has finished (end), or clear the marker. |
| `uiiq_nx2u_event_slate` | 'Slate now' (on: true) shows viewers the holding card within ~10 s; 'Back on air' (on: false). |
| `uiiq_nx2u_event_end` | The event is over: the replay window starts and the recording is looked for. |
| `uiiq_nx2u_event_replay_check` | Ask the provider again for the recording of an ended event. |
| `uiiq_nx2u_library` | The tenant's video library (Bunny or Cloudflare), keys masked. |
| `uiiq_nx2u_library_set` | Record (or re-key) the tenant's video library (owner/admin). |
| `uiiq_nx2u_usage` | The tenant's last twelve months of NX2U delivery: viewer-seconds, GB, events. |

### locality — `src/tools/locality.js`

| Tool | What it does |
|---|---|
| `uiiq_locality_list` | The tenant's local areas — each a name and its postcode patterns — active first. |
| `uiiq_locality_create` | Define a local area: a name and a list of postcode patterns. |
| `uiiq_locality_update` | Change a local area. |
| `uiiq_locality_delete` | Delete a local area. |
| `uiiq_locality_check` | Is a postcode local? Checks it against every active local area (or one, with localityId). |

### Admin: blockouts, check-in, fields, waivers, cards, recipes, ticket types, pricing, presets, IQEX forms, press, journalists, design briefs, Acts Direct — `src/tools/admin-ops.js`

| Tool | What it does |
|---|---|
| `uiiq_blockout_list` | The workspace's blockout periods (dates no sessions can be booked), earliest first. |
| `uiiq_blockout_create` | Add a blockout period. |
| `uiiq_blockout_update` | Edit a blockout period; only the fields sent change. |
| `uiiq_blockout_delete` | Delete a blockout period. |
| `uiiq_calendar_month` | A month of the booking calendar: per date, seats booked, capacity and which experiences run. |
| `uiiq_checkin_today` | Today's booking check-in: how many are checked in, how many are expected, and the last 20 arrivals. |
| `uiiq_checkin_booking` | Check a booking in by its reference (the door action for bookings without per-seat tickets). |
| `uiiq_checkin_member_today` | Today's member check-ins: count, unique members, active memberships, and the last 20 check-ins. |
| `uiiq_checkin_member` | Record a member check-in from a customer card token (or /c/<slug>/<token> URL) or a MEM- member code. |
| `uiiq_custom_field_list` | The custom booking-form fields on one experience, in position order. |
| `uiiq_custom_field_create` | Add a custom booking-form field to an experience (placed last). |
| `uiiq_custom_field_update` | Edit a custom booking field: label, type, options (null clears), isRequired, position. |
| `uiiq_custom_field_delete` | Delete a custom booking field. |
| `uiiq_waiver_create` | Set the waiver an experience shows at booking (one per experience: creates or replaces it). |
| `uiiq_waiver_delete` | Remove a waiver template by its id (the waiver's id, not the experience's). |
| `uiiq_launcher_card_list` | The sidebar launcher cards every tenant can see (subject to featureKey), plus the feature keys available for gating. |
| `uiiq_launcher_card_create` | Add a launcher card (name + href required). |
| `uiiq_launcher_card_update` | Edit a launcher card; only the fields sent change. |
| `uiiq_launcher_card_delete` | Delete a launcher card. |
| `uiiq_workshop_card_list` | The Workshop module's cards (each launches a journey by journeySlug), plus the feature keys available for gating. |
| `uiiq_workshop_card_create` | Add a workshop card. |
| `uiiq_workshop_card_update` | Edit a workshop card; only the fields sent change (parentId null makes it top-level). |
| `uiiq_workshop_card_delete` | Delete a workshop card; its sub-cards become top-level. |
| `uiiq_task_recipe_list` | Production task recipes (ordered steps a product's fulfilment follows) with step and linked-product counts. |
| `uiiq_task_recipe_get` | One task recipe with its steps and up to 100 linked catalogue products. |
| `uiiq_task_recipe_create` | Create a task recipe with its steps in order. |
| `uiiq_task_recipe_update` | Edit a recipe's name, description, category, active flag or version. |
| `uiiq_task_recipe_delete` | Retire a recipe (soft delete: active=false). |
| `uiiq_ticket_type_create` | Add a ticket type (name + price in pence) to an experience, placed last. |
| `uiiq_ticket_type_update` | Edit a ticket type: name, description, priceInPence, isActive only. |
| `uiiq_ticket_type_delete` | Delete a ticket type. |
| `uiiq_ticket_booking_pdf` | The printable PDF of every ticket on a booking (one page each). |
| `uiiq_ticket_forward_update` | Edit a scan fan-out target: active, targetUrl, secret (empty clears), externalEventId. |
| `uiiq_booking_refund` | REFUNDS MONEY through the tenant's payment provider for an online booking. |
| `uiiq_member_sign_out` | Sign a member out of the Members App on every phone at this venue (lost phone, disputed account). |
| `uiiq_membership_subscriber_qr` | A member's pass QR as SVG (points at the staff check-in page with their code). |
| `uiiq_merch_set_update` | Set a merch set's sector links (sectorPresetIds replaces them wholesale) and/or active flag. |
| `uiiq_pricing_quote` | An internal sales quote for an existing tenant: its real usage priced at list across every size. |
| `uiiq_pricing_config_get` | The live platform pricing config (tiers, unit credit rates, top-up rate, marketing tariff, platform fee), the defaults, and the last 20 changes. |
| `uiiq_pricing_config_set` | Replace the platform pricing config (audited). |
| `uiiq_pricing_lead_delete` | GDPR-erase a pricing-calculator lead: deletes it AND suppresses the email so a later form can't recreate it. |
| `uiiq_promo_code_update` | Edit or (de)activate a promo code; only the fields sent change and the code text itself is immutable. |
| `uiiq_promo_code_delete` | Delete a promo code that was never used. |
| `uiiq_press_distribution_list` | The press-release distribution services (Pressat, PRLog, OpenPR): enabled flag and a masked key preview. |
| `uiiq_press_distribution_set` | Set a distribution service's API key (stored encrypted) and/or enabled flag. |
| `uiiq_journalist_admin_list` | Every journalist contact on the platform, global ones first. |
| `uiiq_journalist_admin_create` | Add a journalist contact; isGlobal makes it available to every tenant. |
| `uiiq_journalist_admin_update` | Edit a journalist contact; only the fields sent change. |
| `uiiq_journalist_admin_delete` | Delete a journalist contact. |
| `uiiq_design_brief_list` | Customer design briefs, newest first, with status counts. |
| `uiiq_design_brief_get` | One design brief with its site, tenant and resulting design. |
| `uiiq_design_brief_create` | Log a design brief by hand (phone-in / email-in customer). |
| `uiiq_design_brief_update` | Move a brief's status, assign it, link the resulting design, or edit its text. |
| `uiiq_acts_direct_list` | Acts Direct integration records (artists / bookings mirrored from acts.direct), newest first. |
| `uiiq_acts_direct_update` | Edit an Acts Direct record: posmVendorSlug, stripeCustomerId, stripeSubscriptionId, status, ticketsActive. |
| `uiiq_acts_direct_fire_webhook` | Re-fire an Acts Direct webhook for a record (event one of booking.confirmed, booking.cancelled, booking.updated, artist.approved, artist.suspended, payment.released). |
| `uiiq_iqex_form_list` | The registered IQEX forms (formKey, label, formId, formUrl, plan/canvas sections, active). |
| `uiiq_iqex_form_upsert` | Register or replace an IQEX form config by formKey (idempotent). |
| `uiiq_iqex_form_update` | Edit an IQEX form config by id; only the fields sent change (isActive toggles it). |
| `uiiq_iqex_form_delete` | Remove an IQEX form config. |
| `uiiq_iqex_form_spec` | The printable spec sheet of the active IQEX forms (or one, by formKey) — the HTML IQEX's PDF import reads; open it in a browser to print. |
| `uiiq_iqex_form_system_json` | The platform's system IQEX form definitions as JSON — questions, hints, the webhook field each maps to — for one slug or all, expanded per active site. |
| `uiiq_iqex_form_system_spec` | The printable spec sheet of the system IQEX forms (one slug or all) in the layout IQEX's PDF import reads. |
| `uiiq_preset_list` | Sector presets (named feature bundles + terminology per business sector) with their features and tenant counts. |
| `uiiq_preset_create` | Create a sector preset (key is slugified; must be unique). |
| `uiiq_preset_update` | Edit a preset (featureKeys replaces its feature list). |
| `uiiq_preset_delete` | Delete a preset; tenants on it are detached and keep their copied flags. |
| `uiiq_preset_apply` | Apply a preset to one tenant: copies its features and terminology onto the tenant, overwriting that tenant's feature tweaks. |
| `uiiq_preset_reapply` | Re-apply an edited preset to EVERY tenant on it, overwriting their per-tenant feature tweaks. |

### Platform admin (the operator's control plane) — `src/tools/admin-platform.js`

| Tool | What it does |
|---|---|
| `uiiq_admin_gift_programme_list` | A tenant's Gift Programme registry (Garden Plan Gift and any others): key, label, enabled, value ladder, journey form, outcome. |
| `uiiq_admin_gift_programme_create` | Create a Gift Programme for a tenant. |
| `uiiq_admin_gift_programme_update` | Update one of a tenant's Gift Programmes by key — only the fields you send change (journey and outcome are merged). |
| `uiiq_admin_iqex_link_set` | Link a tenant to an IQEX organisation (orgId) or unlink it (orgId null). |
| `uiiq_admin_iqex_delivery_get` | Whether a tenant's IQEX delivery connection (how IQEX sends briefs back to UIIQ) is in place: state = unlinked \| no_connect_key \| blocked \| not_connected \| connected, plus the connection count. |
| `uiiq_admin_iqex_delivery_connect` | Create or refresh a tenant's IQEX delivery connection: sends the tenant's Connect key to IQEX server-to-server (it never comes back here) and maps every active brief form as a destination. |
| `uiiq_admin_iqex_org_key_status` | Probe a tenant's IQEX Org API key without reading or rotating it: state = readable \| needs_rotation \| blocked \| unlinked \| unreachable. |
| `uiiq_admin_iqex_org_key_rotate` | ROTATE a tenant's IQEX Org API key and RETURN THE NEW KEY ONCE (a secret: handle it as one). |
| `uiiq_admin_member_list` | The members of a tenant (TenantUser rows): membership id, role, user { id, name, email }. |
| `uiiq_admin_member_add` | Add an EXISTING user (by email) to a tenant with a role (OWNER, ADMIN, STAFF). |
| `uiiq_admin_member_remove` | REMOVE a user's membership of a tenant (by the user's id, not the membership id). |
| `uiiq_admin_tenant_user_create` | Create a NEW user account inside a tenant (name, email, password >= 8 chars, role OWNER/ADMIN/STAFF, default STAFF). |
| `uiiq_admin_posm_secret_rotate` | ROTATE a tenant's POSM webhook secret and RETURN THE NEW SECRET ONCE (handle as a secret). |
| `uiiq_admin_product_set` | Set a tenant's entitlement to a product (GROW, RUN, SELL, UIIQ, AI): status ACTIVE, TRIAL, SUSPENDED or CANCELLED — or omit status to remove the product row entirely. |
| `uiiq_admin_tenant_settings_set` | The operator-side settings on a tenant (distinct from uiiq_tenant_settings_update, which is the tenant's own profile): giftCardMaxPence (cap, <= 1,000,000), allowedBookingModes (non-empty subset of the booking modes), iqplantSettings { giftEnabled, giftValues: [{ valuePence, feePence }] } (legacy — prefer the gift programme tools). |
| `uiiq_admin_tenant_stripe_set` | Set the platform fee on a tenant's connected payment account: applicationFeePercent (0–50) and/or passFeesToCustomer. |
| `uiiq_admin_tenant_website_pages_set` | A tenant's Website Pages generation settings: websitePagesModel (HAIKU_4_5, SONNET_4_6, OPUS_4_7), websitePagesBackend (DIRECT or IQEX), selfApproveWebsitePages. (The internal flag is set only by a click in UIIQ.) |
| `uiiq_admin_user_list` | The user accounts in a tenant (id, name, email, role), sorted by name. |
| `uiiq_admin_user_create` | Create a user anywhere on the platform, or with promote:true change an existing user's role (and tenant). |
| `uiiq_admin_user_update` | Change a user's role (OWNER, ADMIN, STAFF, SUPER_ADMIN), status (ACTIVE or SUSPENDED) or name. |
| `uiiq_admin_user_send_reset` | SENDS a password-reset EMAIL to a user (link valid 1 hour, single use). |
| `uiiq_admin_user_set_password` | SET a user's password directly (a secret: it is sent, not shown, and never logged) and sign them out everywhere. |
| `uiiq_admin_api_key_list` | The workspace's API keys: id, name, prefix, permissions, last used, expiry, active. |
| `uiiq_admin_api_key_create` | Mint an API key for the workspace and RETURN IT ONCE (plus a signingSecret for an auction-only key) — both are secrets that are never shown again. |
| `uiiq_admin_api_key_update` | Rename, enable/disable (isActive) or re-permission an API key. |
| `uiiq_admin_api_key_secret_rotate` | ROTATE the signing secret of an auction key (auctions:bid) and RETURN THE NEW SECRET ONCE. |
| `uiiq_admin_api_key_delete` | DELETE an API key permanently — anything using it fails from the next call. |
| `uiiq_admin_feature_create` | Register a new feature flag in the platform catalogue (key is lower-cased, spaces to _; product GROW, RUN, SELL or AI). |
| `uiiq_admin_elevenlabs_key_get` | Whether the workspace has its own ElevenLabs API key set, with a masked preview (first 8 and last 4 characters). |
| `uiiq_admin_elevenlabs_key_set` | SET the workspace's ElevenLabs API key (a secret: sent, never shown or logged), or clear it with apiKey null. |
| `uiiq_admin_vat_get` | The platform VAT rates (GB): standardPct, reducedPct, zeroPct and when they were last changed. |
| `uiiq_admin_vat_set` | Change the platform VAT rates (each 0–100; only the ones you send change). |
| `uiiq_admin_audit_log` | The platform audit log, newest first: filter by resource, resourceId, userId, action (prefix match, e.g. |
| `uiiq_admin_session_list` | The bookable sessions of one experience (experienceId required), optionally between dateFrom and dateTo (ISO dates), up to limit (default 50). |
| `uiiq_admin_session_create` | Add one session to an experience: date (YYYY-MM-DD), startTime and endTime (HH:MM), capacity, optional performerId (a staff member) and resourceIds (active resources, each allocated once). |
| `uiiq_admin_staff_list` | The workspace's Sell staff (performers): internal staff linked to a user, and external ones, with type, role, contact details, tags, price guide and active flag. |
| `uiiq_admin_staff_create` | Add a staff member: staffType INTERNAL (userId required — one profile per user) or EXTERNAL; name required; optional role, bio, contactEmail, contactPhone, tags, priceGuidePence, travelRadius. |
| `uiiq_admin_staff_get` | One staff member by id, with the linked user if internal. |
| `uiiq_admin_staff_update` | Edit a Venue Staff profile (Sell performer) — only the fields you send change. isActive false deactivates them: hidden from the calendar and session pickers, and no new session can be given to them. |
| `uiiq_admin_staff_delete` | Remove a Venue Staff profile: hidden instead when they have sessions, bookings or availability on record; deleted only when they have none. |
| `uiiq_admin_group_list` | The workspace's experience groups in display order, each with its non-archived experiences. |
| `uiiq_admin_group_create` | Create an experience group: name (<= 200) and slug (lowercase, hyphens, <= 100, unique) required; optional description and imageUrl (must be on the platform's image hosts). |
| `uiiq_admin_group_reorder` | Set the display order of experience groups: order = [{ id, position }] (up to 500; positions are whole numbers from 0). |
| `uiiq_admin_group_update` | Edit an experience group: name, slug, description (null clears), imageUrl (null clears), isPublished. |
| `uiiq_admin_group_delete` | DELETE an experience group permanently. |
| `uiiq_admin_venue_list` | The workspace's venues (physical sites experiences and resources belong to) with experience and resource counts. |
| `uiiq_admin_venue_create` | Create a venue: name required (the slug comes from it; 409 if a venue with that name exists), optional description, addressLine1, city, postcode. |
| `uiiq_admin_venue_get` | One venue with its active classes, pending compliance reminders and counts (experiences, resources, bills, recurring costs). |
| `uiiq_admin_venue_update` | Edit a venue: name, description, addressLine1, addressLine2, city, postcode (null clears), isActive, rebookBy (YYYY-MM-DD or null — keeps the venue's rebook reminder in step). |
| `uiiq_admin_add_on_list` | The workspace's booking add-ons (extras sold with an experience), optionally for one experienceId. |
| `uiiq_admin_add_on_create` | Create an add-on: name and priceInPence required; optional experienceId (omit for a workspace-wide add-on), description, imageUrl (platform image hosts only), maxQuantity (default 10), perPerson. |
| `uiiq_admin_add_on_update` | Edit an add-on: name, description, priceInPence, imageUrl, maxQuantity, perPerson, isActive, position. |
| `uiiq_admin_add_on_delete` | DELETE an add-on permanently. |
| `uiiq_admin_booking_email_list` | The workspace's booking email templates (confirmation, reminder, followup, cancellation, deposit_reminder, gift_card, membership): subject, HTML body, enabled, send offset. |
| `uiiq_admin_booking_email_set` | Create or replace one booking email template by type: subject and bodyHtml required; enabled (default true); sendOffsetHours for timed ones (reminder/followup). |
| `uiiq_admin_ota_channels` | The OTA distribution channels (Beyonk, Airbnb Experiences, Viator, FareHarbor) and their connection state. |
| `uiiq_admin_payments_connect_get` | The workspace's connected payment account (Stripe or PayPal): provider, account id, charges/payouts enabled (refreshed from the provider), platform fee, statement descriptor, payout schedule. |
| `uiiq_admin_payments_connect_start` | Start payment onboarding: CREATES a connected account at the provider (STRIPE default, or PAYPAL) if the workspace has none, then returns an onboardingUrl for the owner to complete in a browser. |
| `uiiq_admin_payments_connect_update` | Change the workspace's statementDescriptor (<= 22 chars) or payoutSchedule. |
| `uiiq_admin_site_list` | The platform's websites (umbrella and shop sites): slug, name, kind, domain, active, staging/live URLs, connected shop, and whether a WP bridge secret is set (never the secret). |
| `uiiq_admin_site_create` | Register a website: slug, name, domain required (normalised); kind (default UMBRELLA), stagingUrl, liveUrl, ownerTenantId, wpBridgeSecret (a secret: stored, never shown again). |
| `uiiq_admin_site_update` | Edit a website: slug, name, domain, kind, active, acceptsCustomerDesigns, stagingUrl, liveUrl, ownerTenantId, wpBridgeSecret (a secret; never shown), stackcpPackageId (a numeric 20i package id, "auto" to look it up from the live URL, or empty to clear). |
| `uiiq_admin_location_list` | The platform's physical locations (virtual-office and mailroom addresses) with virtual office and mail item counts. |
| `uiiq_admin_location_create` | Add a physical location: name, addressLine1, city, postcode required; addressLine2, country (default GB). |
| `uiiq_admin_credit_cost_list` | The credit tariff: what each platform action costs in credits (stored rows plus defaults), with category and active flag. |
| `uiiq_admin_credit_cost_create` | Add a tariff row: action_key required, credit_cost (whole credits, default 1), description, category, active (default true). |
| `uiiq_admin_credit_cost_update` | Change a tariff row by action key: credit_cost, description, category, active. |
| `uiiq_admin_ads_tiers_get` | The Ads & Search tier configs (STARTER, GROWTH, SCALE: monthly price, video and keyword limits) and the feature gates (which tier each ads feature needs). |
| `uiiq_admin_ads_tier_update` | Change an ads tier: priceMonthlyPence (whole pence), videoLimit and/or keywordLimit (null = unlimited). |
| `uiiq_admin_ads_gate_update` | Set the minimum tier (STARTER, GROWTH, SCALE) an ads feature gate needs, by gate key (from uiiq_admin_ads_tiers_get). |
| `uiiq_admin_briefing_list` | The last 10 operator daily briefs (date, summary, sections). |
| `uiiq_admin_briefing_run` | RUN today's daily briefing now: builds the agenda and generates the brief with the AI (spends LLM usage), upserting today's row. |
| `uiiq_admin_workflow_templates_seed` | Seed or refresh the platform's global task-workflow templates (Service Appointment, Field Job Dispatch, …): existing ones are overwritten with the built-in definition. |

### API (ping, OpenAPI, Sentry) — `src/tools/api.js`

| Tool | What it does |
|---|---|
| `uiiq_api_ping` | The API's bare liveness ping: { ok: true, t: <server ms> } plus the round-trip latency. |
| `uiiq_api_openapi` | The merged OpenAPI 3.1 document for the UIIQ platform API (the public Booking API under /api/v1 plus the documented admin routes, with per-operation security schemes). |
| `uiiq_api_sentry_selftest` | Fire a test exception through the deployed app's Sentry pipeline and return its event id, to prove the wiring end to end. |

### Assistant — `src/tools/assistant.js`

| Tool | What it does |
|---|---|
| `uiiq_assistant_starters` | The workspace's conversation starters (prompt templates from IQEX: id, name, template). |
| `uiiq_assistant_ask` | Ask the UIIQ assistant a question about the workspace; it runs a tool-using loop over the workspace's data and answers. |

### Brand website pages — `src/tools/brand.js`

| Tool | What it does |
|---|---|
| `uiiq_brand_sites` | The websites bound to this workspace for page editing (id, slug, name, stagingUrl, liveUrl, whether the WordPress bridge is paired). |
| `uiiq_brand_pages` | The pages of a bound site, read live from its WordPress through the uiiq-connect bridge (id, slug, title, status, url). |
| `uiiq_brand_request_list` | Page change requests for the workspace, newest first (status DRAFT → PLANNING → PREVIEWED → APPROVED / APPROVED_PENDING_STAFF → APPLIED, or REJECTED), optionally for one site. |
| `uiiq_brand_request_create` | Open a change request on one page of a bound site (pageId + pageSlug from uiiq_brand_pages). |
| `uiiq_brand_request_get` | One change request in full: chat messages, the proposed patch ops, model + token usage, preview/apply timestamps and its site. |
| `uiiq_brand_request_update` | Retitle a change request, or move its status along the allowed path (DRAFT↔PLANNING→PREVIEWED→APPROVED\|APPROVED_PENDING_STAFF→APPLIED, REJECTED from anywhere; 422 otherwise). |
| `uiiq_brand_request_chat` | Tell the page editor what to change, in plain words. |
| `uiiq_brand_request_apply_staging` | Push the request's patch ops to the site's STAGING WordPress so the change can be looked at (status → PREVIEWED; returns previewUrl). |
| `uiiq_brand_request_publish` | PUBLISH a previewed request to the customer's LIVE website. |
| `uiiq_brand_staging_status` | Whether a site's staging can be refreshed from live through 20i (available, packageId, stagingUrl, whether the staging bridge answers, when live was last copied over). |
| `uiiq_brand_staging_sync` | COPY THE LIVE SITE OVER STAGING on 20i (queued; takes a few minutes). |

### Businesses (CRM) — `src/tools/businesses.js`

| Tool | What it does |
|---|---|
| `uiiq_business_delete_impact` | What a HARD delete of a business would destroy — interactions (calls, emails, notes), people at the business, prospect-search candidate links, each with a count — and any blockers that forbid it. |
| `uiiq_business_email_preview` | Render an email template against a business (merge fields filled from the business, its primary person, the tenant and you) WITHOUT sending: { template, to, from, subject, html, legalFormWarning }. |
| `uiiq_business_email_send` | SEND a templated email to one business from the tenant's configured sender (reply-to = the tenant's reply-to, else you). |
| `uiiq_business_people_list` | Everyone at a business, primary contact first then by name: id, name, role, email, phone, isPrimary, contactId (set only once they have opted in as a Contact). |
| `uiiq_business_person_add` | Add a person to a business. |
| `uiiq_business_person_update` | Edit one person at a business: name, role, email, phone; isPrimary true makes them the main contact (you cannot untick the only main contact — promote someone else instead). |
| `uiiq_business_person_delete` | Remove a person from a business. |

### Customer cards — `src/tools/cards.js`

| Tool | What it does |
|---|---|
| `uiiq_cards_list` | The venue's customer cards (up to 500): holder name/email, status, print status, member code and plan, issued/last-used/revoked/encoded/printed times. |
| `uiiq_cards_members_uncarded` | ACTIVE members who have no live card yet (membership id, name, email, plan), flagging any whose email can't take a card. |
| `uiiq_cards_issue` | Issue cards to members (creates the card record; nothing is printed or charged). |
| `uiiq_cards_update` | Act on one card: reissue (card LOST — the old card, QR and NFC tag stop working at once and a new card starts at NOT_SENT for printing), revoke (cancel with no replacement), or handed-over (an encoded card has been given to its holder). |
| `uiiq_cards_proof_url` | A fresh presigned link (about 15 minutes) to the rendered proof of a card that has been sent to print. |
| `uiiq_cards_templates` | The card designs the venue can have printed (IQEX Design Studio: the stock CR80 card plus any design allowed for its organisation) — slug, name, size, preview. |
| `uiiq_cards_mark_encoded` | Mark a PRINTED card's NFC tag as written and verified, from the URL/token the tag holds (what a staff phone reads when it taps the card). |
| `uiiq_cards_print` | SEND up to 5 unprinted customer cards to IQEX to be printed on a design (slug from uiiq_cards_templates) with the card URL in the QR and NFC. |
| `uiiq_cards_print_refresh` | Ask IQEX where the venue's unprinted customer cards are and move them along: queued → SENT, finished → PRINTED, failed → back to NOT_SENT. |
| `uiiq_cards_students_print` | SEND up to 5 children's check-in cards to IQEX to be printed on a design, each with the child's check-in URL in the QR and NFC. |
| `uiiq_cards_students_refresh` | Move children's printed cards along from IQEX's job status (SENT / PRINTED / back to NOT_SENT on failure). |
| `uiiq_cards_student_handed_over` | Record that a child's PRINTED check-in card is on their lanyard. |
| `uiiq_cards_student_proof_url` | A fresh presigned link (about 15 minutes) to the proof of a child's printed check-in card. |

### Classes — `src/tools/classes.js`

| Tool | What it does |
|---|---|
| `uiiq_classes_list` | List the school's classes (active only unless includeInactive) with teachers, venue, show, schedule type, prices and the active-enrolment count. |
| `uiiq_classes_get` | One class in full: editor fields, every teacher, its course runs, and the roster (enrolments with student names, guardian, fee/paid/owed). |
| `uiiq_classes_create` | Create a class. |
| `uiiq_classes_update` | Replace a class's details. |
| `uiiq_classes_delete` | DELETE a class outright. |
| `uiiq_classes_terms_list` | The school's terms (newest first) with dates, excluded dates and how many course runs each has. |
| `uiiq_classes_term_create` | Create a term: name, startDate and endDate (YYYY-MM-DD), optional excludedDates (half-term etc.) and active. |
| `uiiq_classes_term_update` | Replace a term's name, dates, excluded dates and active flag (all of name/startDate/endDate are required — this is a full replace). |
| `uiiq_classes_term_delete` | DELETE a term. |
| `uiiq_classes_runs_list` | Course runs (a TERM class running in a term), optionally filtered by classId and/or termId, with fee, session dates, capacity, status and active enrolments. |
| `uiiq_classes_run_create` | Create a course run for a TERM class in a term. |
| `uiiq_classes_run_update` | Update a course run's feePence, sessionDates, capacity (null = use the class's) or status. |
| `uiiq_classes_run_delete` | DELETE a course run. |
| `uiiq_classes_session_overrides` | Dated changes to sessions (CANCELLED / COVERED / MOVED): by classId and/or a from-to window, or every class's changes on one date (the register's view). |
| `uiiq_classes_session_override` | Cancel, arrange cover for, or move ONE session of a class on a date — and TELL PEOPLE: unless notifyParents=false this messages every household in the class and the covering teacher (email/SMS through the tenant's comms; suppressed pre-launch, in which case the reply says so). |
| `uiiq_classes_session_restore` | Remove the dated change for a class on a date, putting the ordinary session back. |
| `uiiq_classes_session_audience` | Who a message about a class would reach (one row per household, children named, unsubscribed/archived dropped), plus the staff who could cover and the rooms available. |
| `uiiq_classes_notices_list` | Parent notices (drafts and published, newest first) with their audience, plus the classes and group labels available to address one to. |
| `uiiq_classes_notice_create` | Create a parent notice for an audience ({ classIds, groups, all } — at least one). |
| `uiiq_classes_notice_update` | Replace a notice's title, body, audience, publishedAt and expiresAt (full replace — all of title/body/audience are required). |
| `uiiq_classes_notice_delete` | DELETE a parent notice (it disappears from every family portal at once). |
| `uiiq_classes_policies_get` | The policies guardians are asked to acknowledge in the family portal (key, title, version, url) with how many have acknowledged each at its current version. |
| `uiiq_classes_policies_set` | Replace the WHOLE parent-policy list (max 25; each needs a unique key and a title; url must be https://). |
| `uiiq_classes_enrolments_list` | Enrolments (newest first), filtered by classId and/or studentId: student and class names, term, status, payment mode, fee/paid/owed and instalment arrears. |
| `uiiq_classes_enrolment_get` | One enrolment with its payment ledger (amount, method, till sale, date). |
| `uiiq_classes_enrol` | Enrol a student in a class. |
| `uiiq_classes_enrolment_update` | Change an enrolment's status (TRIAL \| ACTIVE \| WAITLIST \| CANCELLED \| COMPLETED — activating re-checks capacity; CANCELLED keeps the ledger), feePence or notes. |
| `uiiq_classes_enrolment_instalment_link` | Regenerate the Stripe Checkout link for an ACTIVE INSTALMENTS enrolment whose guardian never completed checkout. |
| `uiiq_classes_enrolment_plan_options` | The student's guardian's ACTIVE memberships, each flagged with whether its plan covers the class — what to pass as membershipId for a PLAN enrolment. |
| `uiiq_classes_register_day` | The day's registers (default today): every class running on that date with its students, attendance marks, check-in/out times, paid chip (PAID / OWES / DROP_IN_DUE / PLAN / PLAN_OVER / ARREARS …), stars and costume ticks; cancelled sessions listed separately. |
| `uiiq_classes_register_students` | Names-only student search (id, name, guardian name; max 20) for adding a walk-in to a register. |
| `uiiq_classes_register_mark` | Mark a student PRESENT, ABSENT or LATE for a class on a date. With student absences on, ILL too (stored as ABSENT, linked to an illness, a neutral "noted as unwell" notice instead of "Missed class"); ILL only by the class's teachers, cover or owners/admins, for an enrolled child, today or earlier. |
| `uiiq_classes_register_payment` | TAKE A PAYMENT at the register against an enrolment (drop-in fee, plan excess or owed balance): raises a CASH/CARD till sale so it lands in daily takings, records it on the ledger, and with sessionDate stamps that day's attendance as paid (creating a PRESENT mark if none). |
| `uiiq_classes_register_star` | Toggle a star for a student in a class on a date (calling again removes it; the reply says starred true/false). |
| `uiiq_classes_register_costume` | Tick a student's costume for a show as handedOut and/or paid (send at least one). |
| `uiiq_classes_attendance_report` | Attendance rate by class and by student over a date range (inclusive; default the last 8 weeks), flagging students under the tenant's low-attendance threshold. |
| `uiiq_classes_absences_list` | Every student's absences (student absences on): requests waiting, who is away, history; filters status/from/to/order, paged by cursor. Owners/admins see all plus the waiting count; others only excused absences, with detail on their own classes. Notes only with includeNotes=true. |
| `uiiq_classes_register_settings` | The register-hook settings: lapseWeeks, arrearsGraceDays, lowAttendancePct, lateGraceMins; with student absences on, absenceApprovalRequired (parents' time off waits for approval; default false). |
| `uiiq_classes_register_settings_set` | Update any of lapseWeeks (1-52), arrearsGraceDays (0-90), lowAttendancePct (1-100), lateGraceMins (0-120), and (student absences on) absenceApprovalRequired. OWNER/ADMIN. |
| `uiiq_classes_register_scan` | Record ONE scan of a child's check-in card/QR/NFC tag (token = the scanned URL or token) for a date, as the signed-in staff member would from the scanner: checks the child in to the class running now (or classId), or signs them out on a second scan where the class requires it. |
| `uiiq_classes_register_scan_sync` | Drain an offline scan queue: up to 100 scans [{ clientId, token, sessionDate, classId?, signedOutBy?, scannedAt }] processed in order, idempotently; results keyed by clientId. |
| `uiiq_classes_scan_cards` | The printable check-in card sheet for a class: each enrolled child's QR (data URI; max 120) with their name as a SEPARATE field and their printed-card status. |

### Estimates and proposals — `src/tools/estimates.js`

| Tool | What it does |
|---|---|
| `uiiq_estimates_list` | Every estimate (newest first) with its lines and totals. |
| `uiiq_estimates_create` | Create a DRAFT estimate (reference EST-… is generated). |
| `uiiq_estimates_get` | One estimate with its lines, totals, deposit/balance and status timestamps. |
| `uiiq_estimates_update` | Edit an estimate's header, set depositPence (balance due is derived) or move its status (DRAFT\|SENT\|ACCEPTED\|DECLINED\|EXPIRED\|CONVERTED — SENT/ACCEPTED/DECLINED/CONVERTED stamp their timestamp). |
| `uiiq_estimates_delete` | DELETE an estimate and its lines. |
| `uiiq_estimates_line_add` | Add a line to an estimate; totals are recomputed. |
| `uiiq_estimates_line_update` | Edit one line of an estimate (quantity, price, cost, discount, tax, description, section, position); the line and estimate totals are recomputed. |
| `uiiq_estimates_line_delete` | DELETE one line from an estimate; totals are recomputed. |
| `uiiq_estimates_proposals` | The proposal versions generated for an estimate, newest first, each carrying its frozen contentJson. |
| `uiiq_estimates_proposal_create` | Generate a new proposal version for an estimate: a frozen snapshot of the estimate, its lines and totals, the tenant's branding/address/bank details and a template (templateId, else the tenant's default template, else terms only). |

### Events — `src/tools/events.js`

| Tool | What it does |
|---|---|
| `uiiq_event_list` | The workspace's events, soonest first (id, slug, name, tagline, image, start/end, status DRAFT\|PUBLISHED\|ARCHIVED, linked experience). |
| `uiiq_event_create` | Create an event (slug derived from the name, unique per workspace). |
| `uiiq_event_get` | One event with its linked experience (id, name, slug, status). |
| `uiiq_event_update` | Edit an event: name, tagline, description, imageUrl, venueNote, startsAt, endsAt (null clears), status DRAFT\|PUBLISHED\|ARCHIVED, experienceId (null unlinks). |
| `uiiq_event_delete` | DELETE an event and its unapproved generated drafts (draft social posts, draft campaign, draft press release); approved pieces stay in their own systems and the event's display board token is revoked so screens go dark. |
| `uiiq_event_generate` | Generate the event's marketing in one go: social posts + email campaign drafted by Anthropic, a press release via the IQEX Chris pipeline, and a display board slide. |
| `uiiq_event_content` | The event's generated marketing, assembled live: social posts (with platforms + approved), the email campaign, the press release, the display board (with its /board URL) and how many social accounts are connected. |
| `uiiq_event_content_review` | Approve or discard one generated piece. |

### Forms — `src/tools/forms.js`

| Tool | What it does |
|---|---|
| `uiiq_form_list` | The workspace's signup forms and surveys, newest first (id, name, type inline\|popup\|slide-in, fields, tags, active, isSurvey, surveyUrl, surveyFormKey, fundedProjectId). |
| `uiiq_form_create` | Create a signup form (type inline default \| popup \| slide-in; fields default email + name; tags are applied to signups). |
| `uiiq_form_get` | One signup form / survey in full. |
| `uiiq_form_update` | Update a signup form / survey — only the fields you send change (fields/tags/settings are replaced wholesale when sent). |
| `uiiq_form_delete` | DELETE a signup form / survey permanently. |
| `uiiq_form_embed` | The embed snippet for an active signup form: the <script> tag to paste into any website, plus the iframe URL. |
| `uiiq_form_send` | SEND a survey's link BY EMAIL to an audience — every subscribed, unsuppressed contact the audience matches (audience: { type:'all' } \| { type:'tag', value } \| { type:'segment', value:segmentId } \| { type:'class', value:<class spec> }; omit for everyone). |
| `uiiq_form_results` | A survey's numbers — response rate against invitations, per-question aggregates and free-text answers verbatim — filtered by classId, group, fundedProjectId, from, to. |
| `uiiq_form_results_export` | Save a survey's raw responses as CSV (one row per submission, one column per question, respondent name + email alongside — PERSONAL DATA) to outPath (default ./<form id>-responses.csv). |
| `uiiq_form_app_list` | The IQForms published to the venue's Members App (title, iqformId, audienceType/Value, required, perChild, dueAt, active, position, done count) plus the audience pickers (plans, classes, groups) the office chooses from. |
| `uiiq_form_app_iqforms` | The venue's own IQEX forms available to publish (id, title, whether Public — only those can go in the app — and whether already published), plus createUrl for the guided IQForm builder. |
| `uiiq_form_app_publish` | PUBLISH an IQForm into the Members App: ref is the IQForm id or a link containing form-id= (must exist on the venue's own IQEX org and be Public). |
| `uiiq_form_app_update` | Update a published Members-App form: title, audience (audienceType + audienceValue), required, perChild, active, position, dueAt (null clears). |
| `uiiq_form_app_remove` | Take a form out of the Members App (deletes the publication; the IQForm itself and its submissions on IQEX are untouched). |
| `uiiq_form_app_status` | Who a published Members-App form is for and who has done it (per member / per child) — the office's completion view. |

### Funding tracker — `src/tools/funding.js`

| Tool | What it does |
|---|---|
| `uiiq_funding_projects` | Every funded project with its money roll-up: award, budgeted across headings, allocated, claimed, received, remaining, unbudgeted and draft-claim count. |
| `uiiq_funding_project_add` | Start tracking a new award. |
| `uiiq_funding_project_get` | One award in full: header, headings with roll-ups (budget, match share, spent, claimed, remaining, units), the allocations ledger, every claim with its lines, and totals. |
| `uiiq_funding_project_update` | Edit an award's header fields (name, funder, dates, award, status, claim frequency, notes, Xero account code). |
| `uiiq_funding_project_delete` | DELETE a funded project with all its headings, allocations and draft claims. |
| `uiiq_funding_headings` | A project's spend headings, each rolled up (budget, match-funded share, spent, claimed, remaining, units used of planned). |
| `uiiq_funding_heading_add` | Add a spend heading to a project: name + budgetPence required; matchFundedPence (≤ budget) + matchSource for part-match-funded headings; plannedUnits + unitLabel for unit-based reporting; costCategoryId links it to a cost category. |
| `uiiq_funding_heading_update` | Edit a heading's name, budget, match funding, units, cost category (empty string unlinks), notes or order. |
| `uiiq_funding_heading_delete` | DELETE a spend heading. |
| `uiiq_funding_allocations` | The allocations ledger with totals. |
| `uiiq_funding_allocation_add` | Charge spend to a funding heading: headingId, amountPence (non-zero integer) and incurredOn (YYYY-MM-DD) required. |
| `uiiq_funding_allocation_update` | Edit an UNCLAIMED allocation (amount, date, heading, description, units). |
| `uiiq_funding_allocation_delete` | DELETE an unclaimed allocation from its heading. |
| `uiiq_funding_claims` | A project's claims, newest period first, each with its per-heading lines. |
| `uiiq_funding_claim_prepare` | Prepare a DRAFT claim for a period from the unclaimed spend in it, grouped by heading, less the match-funded share. |
| `uiiq_funding_claim_get` | The claim statement: header, per-heading lines, the allocations behind them (a DRAFT shows what it WOULD take; a submitted claim shows what is stamped to it) and the tenant's address block. |
| `uiiq_funding_claim_update` | Move a claim through its lifecycle or edit its notes/reference. |
| `uiiq_funding_claim_delete` | Throw away a DRAFT claim (its allocations are released). |
| `uiiq_funding_claim_xero_invoice` | 'Raise in Xero': submits the claim (stamping its allocations, as action=submit does) and WRITES A SALES INVOICE TO THE TENANT'S XERO BOOKS — one line per heading at the funder's share, to the funder contact (found or created in Xero), AUTHORISED unless draft=true. |

### Integrations (Xero, POSM) — `src/tools/integrations.js`

| Tool | What it does |
|---|---|
| `uiiq_integrations_list` | The tenant's connected import sources: id, provider (WOOCOMMERCE \| API \| XERO…), name, status, lastSyncedAt, lastSyncCount and non-secret config. |
| `uiiq_integrations_add` | Add an import source with its credentials (encrypted at rest). |
| `uiiq_integrations_delete` | DELETE an import source and its stored credentials. |
| `uiiq_integrations_sync` | Pull contacts from an import source into the tenant's contact list (new emails only, tagged by provider, UNSUBSCRIBED from email and SMS — a customer list is not marketing consent; existing contacts keep their subscription): WooCommerce customers, a generic API list, or Xero customers. |
| `uiiq_integrations_posm_sync` | Sync the tenant's own Sell bookings and memberships into contacts: creates missing contacts UNSUBSCRIBED from email and SMS (existing contacts keep their subscription) and adds posm/booking/member/plan tags to existing ones. |
| `uiiq_integrations_xero_accounts` | The REVENUE accounts in the Xero organisation behind a XERO import source (sourceId from uiiq_integrations_list) — pick one for uiiq_integrations_xero_config_set. |
| `uiiq_integrations_xero_config_set` | Set the Xero sales account code that UIIQ sales invoices post to, on a XERO import source. |
| `uiiq_integrations_xero_financials` | Xero headline financials for a period (default: this month to date): income, expenses, net profit from the P&L report, plus the 20 most recently updated paid/authorised sales invoices. |

### Mail (Office) — `src/tools/mail.js`

| Tool | What it does |
|---|---|
| `uiiq_mail_list` | Mail items received for the tenant, newest first, with the location name: optional status (RECEIVED \| NOTIFIED \| SCANNED \| FORWARDING \| FORWARDED \| COLLECTED \| SHREDDED), page, limit (max 100). |
| `uiiq_mail_get` | One mail item with its location's address. |
| `uiiq_mail_log` | Log a newly received mail item (status RECEIVED): locationId (required), sender, type (default LETTER), notes, scanUrl. |
| `uiiq_mail_update` | Move a mail item on: action scan \| forward \| forwarded \| collect \| shred \| notify sets the matching status (scan takes scanUrl; forward takes trackingNumber and forwardingAddressId, whose address is written into the notes; forwarded takes trackingNumber). |

### Shop admin, print, designs, suppliers — `src/tools/shop-admin.js`

| Tool | What it does |
|---|---|
| `uiiq_shop_product_list` | Products the workspace can order from active connected shops (up to 200): id, name, category, brand, retail and default price. |
| `uiiq_shop_pricing` | The workspace's assortment as priced for it: partner price per product (with any per-tenant override), the IQEX credit price where a product can be bought with credits, and the credit balance. A coin made from an IQEX template comes with its `design.fields` to fill in. |
| `uiiq_shop_designs` | Approved designs the workspace may put on products: global ones plus its own tenant-only ones. |
| `uiiq_shop_order_list` | The workspace's own shop orders (newest first) with line items, optionally filtered by status. |
| `uiiq_shop_order_place` | Place a shop order for the workspace. A coin made from an IQEX template takes its template `fields` instead of `notes` on a credit line. |
| `uiiq_shop_catalogue_sync` | Pull a workspace's own WooCommerce import source into its product cache (published products, 100 max). |
| `uiiq_shop_assortment_list` | A tenant's assortment: the catalog products it can order, in position order, with price override and custom name. |
| `uiiq_shop_assortment_add` | Add a catalog product to a tenant's assortment (409 if already there), optionally with a per-tenant price override in pence and a custom name. |
| `uiiq_shop_assortment_remove` | Remove an assortment row (by its assortment id, not the product id). |
| `uiiq_shop_assortment_bulk_by_sector` | Add every active, visible catalog product tagged with any of the given sectors to a tenant's assortment; products already there are skipped. |
| `uiiq_shop_catalog_list` | The UIMerch catalog, newest first, with facets (categories, shops, brands). |
| `uiiq_shop_catalog_get` | One catalog product in full: supplier SKU, design, recipe, placements with technique and tier, variants, assortments, site bindings and WooCommerce push state. |
| `uiiq_shop_catalog_configure` | Configurator: turn a supplier SKU into a priced catalog product. |
| `uiiq_shop_catalog_configure_print` | Print configurator: turn a print product template + option selection into one priced catalog product PER connected shop. |
| `uiiq_shop_catalog_update` | Edit a catalog product: name, slug, descriptions, images, category, sectorTags, brand, design, recipe, active, hiddenInShop, prices, creditActionKey (IQEX tariff key so tenants can pay with credits), productReferenceWidthCm. |
| `uiiq_shop_catalog_push` | PUSH a catalog product to a WooCommerce site now (creates or updates the WC product). |
| `uiiq_shop_catalog_delete` | Archive a catalog product (active=false). |
| `uiiq_shop_catalog_mockup_generate` | Fire the IQEX mockup recipe for a catalog product: composites its design artwork onto the product image at the placements. |
| `uiiq_shop_catalog_sector_backfill` | Add an active, visible catalog product to the assortment of every tenant whose sector preset matches one of its sector tags. |
| `uiiq_shop_catalog_preset_list` | Preset combos (named quantity + option bundles at a fixed price) on a catalog product. |
| `uiiq_shop_catalog_preset_add` | Add a preset combo to a catalog product: name, quantity, pricePence, optional description, options object and position. |
| `uiiq_shop_catalog_preset_update` | Edit a preset combo (by presetId) on a catalog product: name, description, options, quantity, pricePence, active, position. |
| `uiiq_shop_catalog_preset_remove` | Delete a preset combo from a catalog product. |
| `uiiq_shop_catalog_variant_list` | A catalog product's variants (linked supplier SKUs with stock and prices) plus the candidate sibling SKUs sharing its parent SKU that are not yet variants. |
| `uiiq_shop_catalog_variant_add` | Add supplier SKUs as variants of a catalog product (upsert; partner price = wholesale + the product's print cost, at its markup). |
| `uiiq_shop_catalog_variant_update` | Edit a variant: active, sku, imageUrl, colour, size, position, attributesJson. |
| `uiiq_shop_catalog_variant_remove` | Delete a variant from a catalog product. |
| `uiiq_shop_connected_list` | The connected WooCommerce shops with product and order counts, last sync, and whether credentials are set (keys are never returned). |
| `uiiq_shop_connected_get` | One connected shop (credentials redacted). |
| `uiiq_shop_connected_add` | Connect a WooCommerce shop: name, slug, url and its REST consumerKey/consumerSecret (stored encrypted). |
| `uiiq_shop_connected_update` | Edit a connected shop: name, url (https, public), consumerKey/consumerSecret, brandColor, logoUrl, active, taskBoardId. |
| `uiiq_shop_connected_remove` | Delete a connected shop. |
| `uiiq_shop_connected_test` | Test a connected shop's WooCommerce credentials against its store. |
| `uiiq_shop_connected_sync` | Pull every product from a connected shop into the catalog (upsert by WC product id; tenant-facing default price is never overwritten). |
| `uiiq_shop_connected_rotate_secret` | Rotate a connected shop's webhook secret; the old one stops working at once and the new one is returned ONCE. |
| `uiiq_shop_admin_order_list` | Shop orders across every tenant, newest first, with tenant name and line items. |
| `uiiq_shop_admin_order_get` | One shop order in full: tenant, items with catalog product cost and price, source shop, linked task card. |
| `uiiq_shop_admin_order_approve` | Approve a pending shop order: PUSHES it to the source WooCommerce shop as a paid order (goods get made) and opens a task card. |
| `uiiq_shop_admin_order_reject` | Reject a shop order that has not reached the shop (PENDING_REVIEW, PAYMENT_FAILED, or stale AWAITING_PAYMENT/PUSHING). |
| `uiiq_shop_admin_order_mark_invoiced` | Record that a shop order has been invoiced (optional invoiceNumber; stamps invoicedAt). |
| `uiiq_shop_admin_order_mark_paid` | Record that a shop order's invoice has been paid (stamps paidAt). |
| `uiiq_shop_push_status` | WooCommerce push health: product and variant pushes that errored (up to 200 each), error totals, and the sites. |
| `uiiq_shop_reprice` | Reprice configurator-built products whose supplier wholesale cost has drifted from the snapshot: recomputes partner/retail/default price at each product's markup. |
| `uiiq_print_template_list` | Print designs (IQEX Design Studio templates) the venue can print tickets and vouchers on, optionally by category (e.g. |
| `uiiq_print_tickets_send` | SEND a booking's tickets to the IQ Labs print queue on a ticket design (template slug). |
| `uiiq_print_tickets_status` | Print status (and proof link) of each of a booking's tickets in the IQ Labs queue. |
| `uiiq_print_vouchers_send` | SEND gift vouchers (by gift card id) to the IQ Labs print queue. |
| `uiiq_print_vouchers_status` | Print status (and proof link) of gift vouchers in the IQ Labs queue, by gift card ids. |
| `uiiq_print_product_list` | Active print product templates (global ones, plus a tenant's own when tenantId is given) with their options and pricing matrix. |
| `uiiq_print_product_get` | One print product template in full (options, pricing matrix, supplier, owning tenant). |
| `uiiq_print_product_update` | Edit a print product template: name, description, active, tenantId (null = global), imageUrls, marginPercent, defaultMaterial, defaultSize, defaultQuantity. |
| `uiiq_print_technique_list` | Print techniques (DTF, embroidery, laser...) with pricing mode, formula inputs and product/tier counts. |
| `uiiq_print_technique_create` | Create a print technique: slug, name, baseCostPence; pricingMode AREA (needs materialAreaCm2) \| VOLUME (materialMlPerUnit) \| OUTSOURCED (no surcharge); supplierProductId = the consumable whose wholesale price feeds the formula; materialMarkupBasis, labourRatePerMinPence, setupCostPence. |
| `uiiq_print_technique_update` | Edit a print technique by id: any of slug, name, description, baseCostPence, setupCostPence, active, pricingMode, supplierProductId, materialAreaCm2, materialMlPerUnit, materialMarkupBasis, labourRatePerMinPence. |
| `uiiq_print_tier_list` | A technique's price tiers (sizes or volumes) with the computed print cost of each and its breakdown ('—' when the technique is missing formula inputs). |
| `uiiq_print_tier_add` | Add a price tier to a technique: name, labourMinutes, plus widthCm+heightCm (AREA/OUTSOURCED) or volumeMl (VOLUME); optional position, active. |
| `uiiq_print_tier_update` | Edit a price tier: name, labourMinutes, widthCm/heightCm or volumeMl (by the technique's mode), position, active. |
| `uiiq_print_tier_remove` | Delete a price tier; a tier still used by product placements is disabled (active=false) instead and the response says so. |
| `uiiq_design_list` | The design library, newest first, with facets. |
| `uiiq_design_get` | One design with its owner tenant, origin site and up to 50 products using it. |
| `uiiq_design_presign` | A presigned S3 POST for a design file: kind artwork (png/jpeg/webp/tiff/pdf, 200 MB, needs slug), preview (png/jpeg/webp, 10 MB, needs slug) or logo (needs tenantId; non-super-admins only their own). |
| `uiiq_design_create` | Register a design: slug + name, optional description, tags, origin (default STAFF_UPLOAD), category (default GENERIC), visibility (default DRAFT; TENANT_ONLY needs ownerTenantId), reviewStatus (default APPROVED), previewImageUrl, artworkFileUrl (+ artworkContentType, artworkSizeBytes, artworkPageCount), sourceWidthMm/HeightMm/Dpi, siteOriginId, submittedBy (customer email). |
| `uiiq_design_upload` | Upload artwork from a local path and register it as a design in one go (presign, put to S3, create): slug, name, path, optional previewPath (png/jpeg/webp) and the same metadata as uiiq_design_create. |
| `uiiq_design_update` | Edit a design: name, description, tags, origin, category, visibility, reviewStatus (approve/reject here), ownerTenantId, siteOriginId, previewImageUrl, artwork fields, source size/dpi, submittedBy, active. |
| `uiiq_design_delete` | Archive a design (active=false). |
| `uiiq_design_send_proof` | SENDS a proof-approval EMAIL to the design's submittedBy address (must be a valid email) with a 7-day link; any earlier proof response is cleared. |
| `uiiq_supplier_list` | All suppliers with their type (product shape) and counts of products, imports and print products. |
| `uiiq_supplier_create` | Create a supplier: slug, name, typeId (a supplier type), feedKind (MANUAL default, or the feed kinds e.g. |
| `uiiq_supplier_products` | A supplier's active SKUs (by supplier slug) with facets: search (name/SKU/parent SKU), brand, colour, productType, page, limit (max 100). |
| `uiiq_supplier_print_products` | A supplier's print product templates (by supplier slug) and the tenants that own private ones. |
| `uiiq_supplier_sync` | Run a supplier's feed sync now (pulls its SKUs, stock and wholesale prices; can take minutes). |
| `uiiq_supplier_scrape` | Fire an IQEX services scrape of a SCRAPE-feed supplier's website into a snapshot (result arrives by callback). |
| `uiiq_supplier_type_list` | Supplier types (the product shape a supplier's feed takes: FLAT_SKU, PRINT_MATRIX, SERVICE, DIGITAL, NONE) with supplier counts. |
| `uiiq_supplier_type_get` | One supplier type with its suppliers. |
| `uiiq_supplier_type_create` | Create a supplier type: slug, name, productShape (default FLAT_SKU), description, requiresDesign, hasStockLevel (default true), isInternal, isDropship, sortOrder. |
| `uiiq_supplier_type_update` | Edit a supplier type: name, description, productShape, requiresDesign, hasStockLevel, isInternal, isDropship, sortOrder. |
| `uiiq_supplier_type_delete` | Delete a supplier type; refused (409) while any supplier uses it. |

### Smart pages — `src/tools/smart-pages.js`

| Tool | What it does |
|---|---|
| `uiiq_smart_pages_approvals` | Smart pages and guestbook messages waiting for approval — this workspace's, or every workspace's with staff:true. |
| `uiiq_smart_pages_page_approve` | APPROVE a smart page by slug — it goes PUBLIC. |
| `uiiq_smart_pages_page_send_back` | Send a smart page back to its author with a note saying what needs changing (it stays unpublished). |
| `uiiq_smart_pages_message_moderate` | Approve or reject a guestbook message on a smart page (numeric message id). |

### Students — `src/tools/students.js`

| Tool | What it does |
|---|---|
| `uiiq_students_list` | The student directory grouped by guardian (name, email, phone, owed balance) with each child's dob, groups, photo consent, active enrolments, owed balance and printed-card status. |
| `uiiq_students_get` | One student in full — the ONLY place medical notes, SEND needs, allergies and emergency contact are returned — plus guardian, policy acknowledgements, costumes, shows and every enrolment with its ledger. |
| `uiiq_students_create` | Create a student. |
| `uiiq_students_update` | Partial update of a student: any of the record fields, plus active (false = the child has left; keeps every register), tshirtSize and costumes (full replace of the per-show ledger). |
| `uiiq_students_delete_impact` | What hard-deleting a student would destroy and what forbids it (registers, payments…). |
| `uiiq_students_delete` | HARD-DELETE a student record — for a duplicate or test row only. |
| `uiiq_students_progress_list` | A student's progression notes (newest first, up to 100) and star tally with the 20 most recent stars. |
| `uiiq_students_progress_add` | Add a progression note (visible to the parent): what they're working on, what they've achieved and/or a level — at least one — optionally against a class. |
| `uiiq_students_progress_delete` | DELETE a progression note (the parent may already have seen it). |
| `uiiq_students_card_status` | Whether a child has a check-in card token, when it was issued and when it was last used. |
| `uiiq_students_card_issue` | Mint a child's check-in token if they have none; with regenerate=true REPLACE it (card lost): the old card, printed sheet and NFC tag stop working at once and the print status goes back to NOT_SENT. |
| `uiiq_students_scan_qr` | A child's check-in QR as an SVG (mints the token on first call). |
| `uiiq_students_absences_list` | A student's recorded absences (illness, holiday, appointment, other) with status, whether each is excused and the classes covered. Staff notes only with includeNotes=true (health information). OWNER/ADMIN; 404 unless student absences are switched on. |
| `uiiq_students_absences_record` | Record an absence as staff: a holiday is APPROVED, illness/appointment/other REPORTED; excused at once (register badge, no "Missed class", not counted against attendance). |
| `uiiq_students_absences_update` | Cancel (kept as history, note cleared) or edit a recorded absence; shortening it unlinks register marks it no longer covers. An empty class list is refused. |
| `uiiq_students_absences_approve` | Approve a parent's waiting time-off request (REQUESTED only): APPROVED, authorised, excused; the optional message is shown to the parent. OWNER/ADMIN. |
| `uiiq_students_absences_decline` | Decline a parent's waiting time-off request (REQUESTED only): DECLINED, unauthorised, final; the optional message is shown to the parent. OWNER/ADMIN. |
| `uiiq_students_absences_delete` | ERASE an absence recorded in error (permanent; linked register marks stay, unlinked). Audited with the id and kind only. OWNER/ADMIN. |
| `uiiq_students_groups` | The distinct group labels in use across active students, with a student count each (the group picker for notices, campaigns and SMS). |

### Team (Mastermind) — `src/tools/team.js`

| Tool | What it does |
|---|---|
| `uiiq_team_provision` | Make sure the workspace has an IQEX organisation, creating one when missing (idempotent: alreadyProvisioned:true when it exists). |
| `uiiq_team_owner_avatar_create` | Create the owner's avatar character on IQEX (character id = the tenant slug) with a display name, optional system prompt and personality traits. |
| `uiiq_team_chat` | Chat with a Mastermind team agent (agentId from uiiq_agent_list) on IQEX. |

### Virtual office compliance — `src/tools/virtual-office.js`

| Tool | What it does |
|---|---|
| `uiiq_virtual_office_compliance_list` | Every compliance reminder for the tenant (pending first, then by due date): type, title, dueDate, status pending\|completed\|dismissed, completedAt, notes. |
| `uiiq_virtual_office_compliance_add` | Add a compliance reminder: title + dueDate (ISO date) required; type insurance\|licence\|tax\|companies_house\|contract\|certification\|venue_rebook\|other (default other). |
| `uiiq_virtual_office_compliance_update` | Set a reminder's status (pending \| completed \| dismissed — completed stamps completedAt unless you pass one; empty string clears it) and/or notes. |
| `uiiq_virtual_office_compliance_delete` | DELETE a compliance reminder. |

### Workflow (config, board, email triggers, orders) — `src/tools/workflow.js`

| Tool | What it does |
|---|---|
| `uiiq_workflow_keepsake_list` | Keepsake products (the physical add-on a tier can ship), across tenants or for one tenantId. |
| `uiiq_workflow_keepsake_create` | Add a keepsake product to a tenant's site (sku is upper-cased). |
| `uiiq_workflow_keepsake_update` | Edit a keepsake product; only the fields sent change. |
| `uiiq_workflow_keepsake_delete` | Delete a keepsake product. |
| `uiiq_workflow_site_list` | The WordPress sites registered to push workflow orders in, with their tenant and status. |
| `uiiq_workflow_site_create` | Register a site for a tenant. |
| `uiiq_workflow_site_rotate` | Rotate a site's API token: the old token stops working immediately and the new one is returned once. |
| `uiiq_workflow_site_update` | Rename a site or set its status (ACTIVE / REVOKED — revoked sites can't push orders). |
| `uiiq_workflow_site_delete` | Delete a site registration; its token stops working. |
| `uiiq_workflow_type_list` | Workflow types (what a site sells, e.g. |
| `uiiq_workflow_type_get` | One workflow type with its tiers (and their keepsakes) and order count. |
| `uiiq_workflow_type_create` | Create a workflow type for a tenant's site. |
| `uiiq_workflow_type_update` | Edit a workflow type; only the fields sent change. |
| `uiiq_workflow_type_delete` | Delete a workflow type. |
| `uiiq_workflow_tier_create` | Add a price tier to a workflow type (name, slug, priceGbp required). |
| `uiiq_workflow_tier_update` | Edit a tier; only the fields sent change. |
| `uiiq_workflow_tier_delete` | Delete a tier. |
| `uiiq_workflow_board` | The tenant's workflow order board: columns (intake, in progress, review, fulfilment, complete, issues) with the live orders in each and any pending approval. |
| `uiiq_workflow_email_trigger_list` | The tenant's status-change email triggers (which order status emails whom, with what template). |
| `uiiq_workflow_email_trigger_create` | Add an email trigger: when an order reaches `status`, email the recipient with subject + bodyTemplate. |
| `uiiq_workflow_email_trigger_update` | Edit an email trigger; only the fields sent change (enabled false switches it off). |
| `uiiq_workflow_email_trigger_delete` | Delete an email trigger. |
| `uiiq_workflow_order_assign` | Assign a workflow order to a user in the tenant (assignedUserId null unassigns). |
| `uiiq_workflow_order_request_approval` | Ask the customer to approve a stage of their order: creates an approval link, moves the order to AWAITING_APPROVAL and EMAILS the customer. |

1139 tools.
