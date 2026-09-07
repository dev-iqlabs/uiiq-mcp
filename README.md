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
| Gift cards, vouchers, memberships | `uiiq_sell_gift_card_*`, `uiiq_sell_voucher_*`, `uiiq_sell_membership_plan_*`, `uiiq_sell_subscription_list` | Issue and bulk-issue gift cards, resend or regenerate vouchers, manage membership plans |
| Tickets | `uiiq_ticket_*` | Issue tickets, scan them at the door, see scan stats, forward tickets |
| Donations | `uiiq_donations_*` | Run causes, report on giving, export Gift Aid |
| Orders and commerce | `uiiq_order_*`, `uiiq_commerce_*`, `uiiq_channels_*`, `uiiq_merch_set_*` | Hold and annotate orders, provision hosted shops, set fee rates, settle payouts, sync marketplace channels |
| Retail | `uiiq_retail_*` | Products, categories, suppliers, low-stock alerts, shop sync, stock reasons and reports |
| Till and kitchen | `uiiq_till_*` | Ping a paired till, verify a staff PIN, take a sale or payment intent, redeem an IQPlant plan code |
| Menus (food and drink) | `uiiq_menu_*` | Generate a menu kit, build the live menu, manage menu documents |

### Grow — marketing, CRM and prospecting

| Feature | Tool prefix | You can |
| --- | --- | --- |
| Contacts and segments | `uiiq_contact_*`, `uiiq_segment_*` | List, edit, archive or convert contacts into businesses; preview segments |
| CRM pipeline | `uiiq_prospect_list/get/create/update`, `uiiq_interaction_*`, `uiiq_followups_due` | Move prospects, suppliers and partners along the pipeline, log and edit interactions, see what follow-ups are due |
| Find Prospects | `uiiq_prospect_search_*`, `uiiq_prospect_preset_*`, `uiiq_prospect_sweep_start`, `uiiq_prospect_source_*` | Start a search in businesses, acts, tenders or funding mode, save briefs as presets, sweep town by town, review candidates, read the funnel, manage the source registry |
| Bids and outreach | `uiiq_prospect_job_*`, `uiiq_prospect_video_invite_*`, `uiiq_prospect_ingest` | Adopt tenders and funding calls as bids, send a personalised video hello, bulk-ingest enquiries |
| Email and SMS campaigns | `uiiq_campaign_*`, `uiiq_sms_*` | Create, duplicate and test-send campaigns, read SMS history |
| Social and press | `uiiq_social_*`, `uiiq_press_release_*`, `uiiq_journalist_contact_*` | Schedule posts from templates, draft, redraft, approve and distribute press releases |
| Briefs | `uiiq_grow_brief_morning*`, `uiiq_grow_campaign_brief_generate` | Read or generate the morning brief, turn one campaign brief into channel copy |
| SEO and Google | `uiiq_seo_*`, `uiiq_google_*` | Run audits, apply fixes, check PageSpeed, read Ads, Analytics and Search Console |
| Pricing leads | `uiiq_pricing_leads_list` | See who used the public pricing calculator |
| Website connect | `uiiq_iqlink_claim`, `uiiq_tenant_api_key` | Pair a connected site and issue its Connect key |

### Run — operations, finance, people and knowledge

| Feature | Tool prefix | You can |
| --- | --- | --- |
| Tasks and boards | `uiiq_task_*`, `uiiq_board_*` | Create projects, boards and cards, assign, comment, move, tick checklists |
| Workflows and automations | `uiiq_workflow_*`, `uiiq_automation_*` | Trigger workflows, inspect instances, toggle automations |
| HR and payroll | `uiiq_hr_*` | Staff records, clock-ins, timesheets, leave approvals, payroll runs and exports |
| Costs and planning | `uiiq_costs_*`, `uiiq_plan_*`, `uiiq_report_*` | Bills, allocations, recurring costs, period locks, KPI rolls; the business plan's revenue, expenses, personnel and statements; revenue and usage reports |
| Billing and credits | `uiiq_billing_*`, `uiiq_credits_*` | Invoices, usage, billing overrides, the IQEX credit balance and ledger |
| Portfolio | `uiiq_portfolio_*` | Every product as a project record with blockers |
| Documents, media, templates | `uiiq_document_*`, `uiiq_media_*`, `uiiq_template_*` | Read documents, upload or generate media, use social and email templates |
| Knowledge and advisors | `uiiq_brains_*`, `uiiq_boardroom_*`, `uiiq_agent_*` | Ask a sector Brain, run a Boardroom session with the Mastermind team, read agent definitions |
| Journeys | `uiiq_journey_*` | Start, advance and resume guided Make-a-Trail journeys |
| Materials and legacy films | `uiiq_material_*`, `uiiq_legacy_*` | Discover, verify and watch materials; list legacy films |

### Devices and IQ products

| Feature | Tool prefix | You can |
| --- | --- | --- |
| IQDisplay signage | `uiiq_display_*` | Screens, channels, items, groups and schedules |
| IQPlant | `uiiq_iqplant_*`, `uiiq_till_iqplant_plan_code` | Garden Planner plans, nursery stock mapping, plan-code redemption at the till |

### Platform administration

| Feature | Tool prefix | You can |
| --- | --- | --- |
| Tenants and organisations | `uiiq_tenant_*`, `uiiq_org_*` | Create, rename, delete or restore tenants, set features, read usage |
| Health | `uiiq_status`, `uiiq_system_health` | API health and latency, infrastructure, alarms and AWS cost against budget |

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
| `uiiq_system_health` | Get the latest UIIQ System Health snapshot: Amplify infra/build status, CloudWatch alarm rollups, month-to-date AWS cost vs the monthly budget,… |

### Tenants — `src/tools/tenant.js`

| Tool | What it does |
| --- | --- |
| `uiiq_tenant_list` | List UIIQ tenants (summary rows). |
| `uiiq_tenant_get` | Get full detail for a UIIQ tenant by ID. |
| `uiiq_tenant_create` | Create a new UIIQ tenant. |
| `uiiq_tenant_api_key` | Generate or retrieve the UIIQ Connect API key for a tenant (used for the uiiq-connect WordPress plugin). |
| `uiiq_tenant_features` | Get or set feature flags for a UIIQ tenant. |
| `uiiq_tenant_usage` | Get usage stats for a UIIQ tenant (sends, contacts, API calls). |
| `uiiq_tenant_rename` | Change a UIIQ tenant's slug. |
| `uiiq_tenant_delete` | Delete or restore a UIIQ tenant. |
| `uiiq_tenant_settings_update` | Update a tenant's own settings — patch semantics, only the fields you send change. |

### Organisations — `src/tools/org.js`

| Tool | What it does |
| --- | --- |
| `uiiq_org_list` | List organisations. |
| `uiiq_org_get` | Get an organisation by ID. |
| `uiiq_org_features` | Get feature flags / entitlements for an organisation. |

### Contacts — `src/tools/contact.js`

| Tool | What it does |
| --- | --- |
| `uiiq_contact_list` | List UIIQ contacts. |
| `uiiq_contact_get` | Get a UIIQ contact by ID. |
| `uiiq_contact_update` | Edit one contact, or archive / restore it. |
| `uiiq_contact_delete` | Remove a contact — SOFT: it is archived, leaving every list and every campaign audience, but its send history, donations and student links survive… |
| `uiiq_contact_convert` | Move marketing Contacts into the relationship layer as Businesses (PROSPECT / CUSTOMER / SUPPLIER / PARTNER) — for the… |

### CRM — businesses (prospects / suppliers / partners) — `src/tools/crm.js`

| Tool | What it does |
| --- | --- |
| `uiiq_prospect_list` | List a tenant's prospects (or suppliers / partners / business customers) with pipeline stage counts. |
| `uiiq_prospect_get` | Get one business — full record including its people and any custom fields from import. |
| `uiiq_prospect_create` | Add a prospect (or supplier / partner) by hand. |
| `uiiq_prospect_update` | Update a business — most often to move it along the pipeline: { stage: 'CONTACTED' }. |
| `uiiq_prospect_import` | Bulk-import businesses from already-parsed rows; upserts by name, never touches marketing contacts (max 10,000). |

### CRM — interactions, follow-ups, Find Prospects searches — `src/tools/crm-journey.js`

| Tool | What it does |
| --- | --- |
| `uiiq_interaction_log` | Log an interaction on a business/prospect — a call (with structured outcome), email (paste it in), meeting, note, or SOCIAL outreach (a DM on the… |
| `uiiq_interaction_list` | The journey on one business — every logged call, email, meeting, note and social outreach, newest-happened-first. |
| `uiiq_followups_due` | Every due or overdue follow-up on the tenant's businesses, oldest first — the 'what should I chase today' list. |
| `uiiq_interaction_update` | Tick a follow-up off (or un-tick it) — followUpDone is the only editable field. |
| `uiiq_interaction_delete` | Delete a mislogged interaction. |
| `uiiq_prospect_search_start` | Start a Find Prospects discovery search: describe who you're looking for and where; the research engine (IQEX) returns candidates with a reason… |
| `uiiq_prospect_search_rerun` | Run a stuck or failed search again on the SAME row with the brief it already has. |
| `uiiq_prospect_search_delete` | Remove a search and its candidates. |
| `uiiq_prospect_search_funnel` | The tenant's Find Prospects funnel over the last N days — searches run, candidates delivered, adopted, dismissed, and what happened next. |
| `uiiq_prospect_search_list` | List the tenant's Find Prospects searches with status and candidate counts. |
| `uiiq_prospect_search_get` | One search with its candidates: business, contact, reason, source_url, opener, and whether each already exists in the pipeline. |
| `uiiq_prospect_search_review` | Review one candidate: 'adopt' creates the Business (source contact-hunter) + person + an opening NOTE carrying the reason and source — or attaches… |

### CRM — presets, sweeps, Prospect Jobs, source registry, video invite, ingest — `src/tools/prospects.js`

| Tool | What it does |
| --- | --- |
| `uiiq_prospect_preset_list` | The tenant's saved Find Prospects briefs — press one, type a town, go. |
| `uiiq_prospect_preset_create` | Save a Find Prospects brief as a preset. |
| `uiiq_prospect_preset_update` | Replace a preset — send the whole preset; omitted fields reset to blank. |
| `uiiq_prospect_preset_delete` | Delete a saved preset. |
| `uiiq_prospect_sweep_start` | A town sweep: one preset × many towns = one job, one review list. |
| `uiiq_prospect_job_list` | The tenant's tenders and funding calls found by Find Prospects (mode tenders/funding), soonest deadline first. |
| `uiiq_prospect_job_update` | Review one tender / funding call: 'adopt' turns it into a task card on the tenant's 'Prospect Jobs' board (created on first use) — due two days… |
| `uiiq_prospect_source_list` | SUPER_ADMIN. The Find Prospects source registry — the portals Tenders and Funding may read (lives on IQEX). |
| `uiiq_prospect_source_create` | SUPER_ADMIN. Propose a source portal — always filed as a CANDIDATE; approval is a separate human update. |
| `uiiq_prospect_source_update` | SUPER_ADMIN. Approve, retire or annotate a source (status, reading_allowed, tos_note). |
| `uiiq_prospect_video_invite_create` | Render a personalised 'we'd love you on board' talking-head video for an ADOPTED candidate (IQEX HeyGen path; charged to the tenant's IQEX org on… |
| `uiiq_prospect_video_invite_get` | Poll an adopted candidate's video invite: { invite: null } when none was started; status pending \| complete (with url) \| failed. |
| `uiiq_prospect_ingest` | A business enquiry becomes a prospect — the route IQForms (via iqlink) and website forms feed lead generation through. |

### Connect / IQlink — `src/tools/connect.js`

| Tool | What it does |
| --- | --- |
| `uiiq_iqlink_claim` | Exchange an IQlink pairing code for the tenant's Connect key: { apiKey, tenantSlug, tenantName, apiBase }. |

### Orders — `src/tools/order.js`

| Tool | What it does |
| --- | --- |
| `uiiq_order_list` | List UIIQ workflow orders. |
| `uiiq_order_get` | Get full detail for a workflow order by reference number. |
| `uiiq_order_note` | Add a note to a workflow order. |
| `uiiq_order_hold` | Put a workflow order on hold. |

### Portfolio — `src/tools/portfolio.js`

| Tool | What it does |
| --- | --- |
| `uiiq_portfolio_list` | List UIIQ portfolio projects (summary rows). |
| `uiiq_portfolio_get` | Get a portfolio project by ID, including its blockers and milestones. |
| `uiiq_portfolio_update` | Update a portfolio project status or progress percentage. |
| `uiiq_portfolio_blocker_add` | Add a blocker to a portfolio project. |
| `uiiq_portfolio_blocker_resolve` | Mark a portfolio project blocker as resolved. |

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

### Sell (bookings, experiences, staff, vouchers, memberships) — `src/tools/sell.js`

| Tool | What it does |
| --- | --- |
| `uiiq_sell_booking_list` | List UIIQ experience bookings. |
| `uiiq_sell_experience_list` | List UIIQ experiences available for booking. |
| `uiiq_sell_subscription_list` | List UIIQ membership subscribers. |
| `uiiq_sell_promo_create` | Create a UIIQ promo discount code. |
| `uiiq_sell_gift_card_issue` | Issue a UIIQ gift card / voucher. |
| `uiiq_sell_gift_card_bulk_issue` | Bulk-issue vouchers (max 500). |
| `uiiq_sell_gift_card_balance` | Check a voucher's validity/balance by code. |
| `uiiq_sell_voucher_download` | Get the download URL for a voucher's printable artifact (PNG for vouchers rendered by UIIQ, legacy PDF for pre-migration cards). |
| `uiiq_sell_voucher_resend` | Re-send a voucher's email to its recipient. |
| `uiiq_sell_voucher_regenerate` | Re-render a voucher's printable artifact (e.g. after changing the voucher branding template). |
| `uiiq_sell_voucher_template_get` | Get the tenant's voucher branding template (vendor name, logo, accent colour, footer, background artwork). |
| `uiiq_sell_voucher_template_update` | Update the tenant's voucher branding. |
| `uiiq_sell_booking_get` | Get a UIIQ booking by ID. |
| `uiiq_sell_booking_create` | Create a new UIIQ booking. |
| `uiiq_sell_booking_cancel` | Cancel a UIIQ Sell booking by ID. |
| `uiiq_sell_calendar_week` | Get the UIIQ Sell week calendar — sessions grouped by day, visit-mode bookings (visits, keyed by date: reference, customer, postcode, window,… |
| `uiiq_sell_staff_availability_list` | List availability blocks (full-day or time-range) for a UIIQ Sell staff member. |
| `uiiq_sell_staff_availability_block` | Block a UIIQ Sell staff member's availability on a date. |
| `uiiq_sell_staff_availability_unblock` | Remove a UIIQ Sell staff availability block. |
| `uiiq_sell_resource_list` | List UIIQ Sell bookable resources (rooms, equipment, vehicles). |
| `uiiq_sell_resource_create` | Create a UIIQ Sell bookable resource (room, chair, equipment, vehicle). |
| `uiiq_sell_resource_delete` | Delete a UIIQ Sell resource by ID. |
| `uiiq_sell_pricing_rule_list` | List UIIQ Sell pricing rules (off-peak discounts, weekend surcharges, seasonal pricing). |
| `uiiq_sell_pricing_rule_create` | Create a UIIQ Sell pricing rule. |
| `uiiq_sell_pricing_rule_delete` | Delete a UIIQ Sell pricing rule by ID. |
| `uiiq_sell_pricing_rule_quote` | Preview what a UIIQ Sell experience would cost on a given date after all matching pricing rules cascade. |
| `uiiq_sell_pricing_intelligence_recommend` | Fetch AI-recommended price adjustments for upcoming UIIQ Sell sessions. |
| `uiiq_sell_service_area_list` | List the tenant's UIIQ Sell service-area territories (postcode-prefix zones with a default technician for visit-mode auto-assign) plus the… |
| `uiiq_sell_service_area_create` | Create a UIIQ Sell service-area territory. |
| `uiiq_sell_service_area_update` | Update a UIIQ Sell service-area territory. |
| `uiiq_sell_service_area_delete` | Delete a UIIQ Sell service-area territory by ID. |
| `uiiq_sell_field_visit_list` | The technician field app's day view: every visit-mode booking for the tenant on a day, optionally filtered to one technician. |
| `uiiq_sell_field_visit_update` | Technician field-app update to one visit-mode booking. |
| `uiiq_sell_resource_notify_set` | Set a UIIQ Sell resource's technician flag and notify contact (used by visit reminders + day-of digests). |
| `uiiq_sell_field_visit_get` | Get one UIIQ Sell visit-mode booking by ID (tenant-scoped) — full field-app detail: customer, address, window, stage, completion… |
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
| `uiiq_sell_membership_plan_update` | Change a membership plan or pass — price, name, term, auto-renew, active state. |

### Tickets — `src/tools/tickets.js`

| Tool | What it does |
| --- | --- |
| `uiiq_ticket_list` | List the individual scannable tickets on a booking (one per seat), with admit status. |
| `uiiq_ticket_issue` | Issue individual QR tickets for a confirmed booking (one per seat). |
| `uiiq_ticket_scan` | Admit (or undo) a single ticket by its code — the door-scan action. |
| `uiiq_ticket_scan_stats` | Today's door-scan stats for the tenant: tickets admitted today and total issued. |
| `uiiq_ticket_forward_list` | List this tenant's scan fan-out targets — downstream products (Acts Direct / CountryComp) that receive a presence-verified scan when a ticket is… |
| `uiiq_ticket_forward_create` | Register a downstream target that receives a scan event whenever a ticket is admitted (presence-verified reviews for Acts Direct / CountryComp). |
| `uiiq_ticket_forward_delete` | Remove a scan fan-out target by id. |

### Donations — `src/tools/donations.js`

| Tool | What it does |
| --- | --- |
| `uiiq_donations_causes_list` | List the tenant's donation causes (the charity's giving options). |
| `uiiq_donations_cause_get` | Get a single donation cause by ID. |
| `uiiq_donations_cause_create` | Create a donation cause. |
| `uiiq_donations_cause_update` | Update a donation cause by ID — rename, edit description/image, reorder (displayOrder) or (de)activate. |
| `uiiq_donations_cause_delete` | Delete a donation cause by ID. |
| `uiiq_donations_report` | The charity's donation dashboard (tenant-scoped, owners/admins only): all-time and this-month totals, per-cause breakdown, recurring-donor count,… |
| `uiiq_donations_gift_aid_export` | Download the HMRC-ready Gift Aid CSV of eligible SUCCEEDED donations (donor name, address, postcode, amount, date). |
| `uiiq_donations_subscription_cancel` | Cancel a recurring (monthly) donation by its Stripe subscription ID. |

### Campaigns — `src/tools/campaign.js`

| Tool | What it does |
| --- | --- |
| `uiiq_campaign_get` | Get an email campaign by ID. |
| `uiiq_campaign_create` | Create a new email campaign. |
| `uiiq_campaign_duplicate` | Duplicate an existing campaign. |
| `uiiq_campaign_test_send` | Send a test email for a campaign to a given address. |
| `uiiq_segment_list` | List contact segments. |
| `uiiq_segment_preview` | Preview which contacts match a segment. |

### SMS — `src/tools/sms.js`

| Tool | What it does |
| --- | --- |
| `uiiq_sms_list` | List SMS messages for the tenant. |
| `uiiq_sms_get` | Get an SMS message by ID. |

### Social — `src/tools/social.js`

| Tool | What it does |
| --- | --- |
| `uiiq_social_posts` | List social media posts. |
| `uiiq_social_accounts` | List connected social media accounts. |
| `uiiq_social_template_list` | List the tenant's IQEX Design Studio social templates (each with field_config so a personalise form can be built). |
| `uiiq_social_template_render` | Render an IQEX Design Studio social template with the tenant's field values (IQEX charges the org pool), then create a DRAFT SocialPost carrying… |

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
| `uiiq_journalist_contact_list` | List journalist contacts available to this tenant — includes global platform contacts (Grimsby Live, BBC Humberside, TechCrunch, etc.) plus any… |
| `uiiq_journalist_contact_add` | Add a journalist contact for this tenant. |

### Grow (briefs) — `src/tools/grow.js`

| Tool | What it does |
| --- | --- |
| `uiiq_grow_campaign_brief_generate` | Generate channel-native ad copy for a marketing campaign across multiple ad networks in one call. |
| `uiiq_grow_brief_morning` | Fetch the latest UIIQ Grow Morning Brief — a daily AI-generated performance summary across all connected ad channels. |
| `uiiq_grow_brief_morning_generate` | Generate (or refresh) today's UIIQ Grow Morning Brief by calling the IQEX ads platform endpoint. |

### Pricing leads — `src/tools/pricing.js`

| Tool | What it does |
| --- | --- |
| `uiiq_pricing_leads_list` | List recent leads from the public pricing calculator (newest first, up to 200). |

### SEO — `src/tools/seo.js`

| Tool | What it does |
| --- | --- |
| `uiiq_seo_audits` | List SEO audits for the tenant. |
| `uiiq_seo_audit` | Run an SEO audit for a URL. |
| `uiiq_seo_pagespeed` | Run a PageSpeed check for a URL. |
| `uiiq_seo_fix` | Apply/suggest a fix for an SEO audit finding. |

### Google (Ads, Analytics, Search Console) — `src/tools/google.js`

| Tool | What it does |
| --- | --- |
| `uiiq_google_analytics` | Google Analytics summary. |
| `uiiq_google_search_console` | Google Search Console summary. |
| `uiiq_google_ads` | Google Ads summary. |

### Brains — `src/tools/brains.js`

| Tool | What it does |
| --- | --- |
| `uiiq_brains_list` | List the Office Brains available to this tenant. |
| `uiiq_brains_ask` | Ask an Office Brain a question. |

### Boardroom — `src/tools/boardroom.js`

| Tool | What it does |
| --- | --- |
| `uiiq_boardroom_ask` | Ask a boardroom AI agent a single question (single-shot). |
| `uiiq_boardroom_sessions` | List your recent boardroom meeting sessions. |
| `uiiq_boardroom_start` | Start a new boardroom meeting session. |
| `uiiq_boardroom_message` | Send a message into a meeting session. |

### Agents — `src/tools/agents.js`

| Tool | What it does |
| --- | --- |
| `uiiq_agent_list` | List all Mastermind Team agents with their type, role, enabled status, and skill/reference counts. |
| `uiiq_agent_get` | Get full config for one agent by slug — includes all skills and references with their content. |
| `uiiq_agent_skill_get` | Get a specific skill's content for an agent. |
| `uiiq_agent_reference_get` | Get a specific reference document for an agent. |

### Journeys (Make a Trail) — `src/tools/journey.js`

| Tool | What it does |
| --- | --- |
| `uiiq_journey_list` | List the Workshop catalogue for the signed-in user's tenant — the deliverable-action cards, each of which launches a journey via its journeySlug. |
| `uiiq_journey_start` | Start a Workshop journey run (e.g. slug 'make-a-trail'); returns runId + runToken to carry into every advance/status/ready call. |
| `uiiq_journey_status` | Get a journey run's status (read-only). |
| `uiiq_journey_ready` | Check whether a journey run's review checkpoint is ready to confirm — no async jobs still processing. Read-only. |
| `uiiq_journey_advance` | Advance a journey run: record the just-completed step's output, charge that step's credits to the org (IQEX-side), and return the next prefilled… |
| `uiiq_journey_resume` | Mint a resume link for a journey run whose embedded form saved progress, and email it to the signed-in user. |

### Media Vault — `src/tools/media.js`

| Tool | What it does |
| --- | --- |
| `uiiq_media_list` | List the tenant's Media Vault (images and video, stored in IQEX). |
| `uiiq_media_upload` | Upload an image or video into the tenant's Media Vault from a local file path or a URL. |
| `uiiq_media_generate` | Generate an image or video with AI into the tenant's Media Vault (IQEX does the generating and charges the org's credits; the result appears in… |
| `uiiq_media_delete` | Delete an asset from the tenant's Media Vault permanently — cannot be undone. |

### Documents — `src/tools/document.js`

| Tool | What it does |
| --- | --- |
| `uiiq_document_list` | List documents in the tenant's vault. |
| `uiiq_document_get` | Get a document by ID. |

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
| `uiiq_menu_document_update` | Update a saved menu document — rename and/or replace the doc body wholesale (fetch it first, send it back modified). |
| `uiiq_menu_document_delete` | Delete a saved menu document by id. |
| `uiiq_menu_build_live` | Create or refresh a LIVE menu from a designed menu's catalogue-linked products so one item set powers print, the menu boards and the till. |
| `uiiq_menu_products` | The tenant's catalogue products for placing onto a menu (id, name, pricePence, description, imageUrl, showInMenu, tillCategory; max 200). |
| `uiiq_menu_kit_generate` | Generate the F&B print kit for the tenant's live menu — IQEX batch-renders the print family (allergen card + shelf label per item + one table QR)… |

### Legacy films — `src/tools/legacy.js`

| Tool | What it does |
| --- | --- |
| `uiiq_legacy_films_list` | List films in the UIIQ legacy film archive. |
| `uiiq_legacy_film_get` | Get a legacy film by ID. |

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

### Till (device-authed) — `src/tools/till.js`

| Tool | What it does |
| --- | --- |
| `uiiq_till_catalog` | List the till catalog (device-scoped). |
| `uiiq_till_ping` | Till device heartbeat — confirm the device is registered and active. |
| `uiiq_till_verify_pin` | Start a staff session with a PIN. |
| `uiiq_till_payment_intent` | Create a card PaymentIntent on the tenant's connected account. |
| `uiiq_till_sale` | Ring up a till sale. |
| `uiiq_till_iqplant_plan_code` | The till scanned an IQPlant garden-plan code (the QR in the customer's email / on their phone). |

### IQPlant — `src/tools/iqplant.js`

| Tool | What it does |
| --- | --- |
| `uiiq_iqplant_garden_plan_list` | The tenant's delivered garden plans, newest first (up to 100): plan code, door (kiosk / home / voucher), level, total, stocked vs not-stocked line… |
| `uiiq_iqplant_stock_map_list` | The tenant's IQPlant stock mapping — every species slug mapped to a product / bay / size / tour spot — plus recommendedNotStocked: species the… |
| `uiiq_iqplant_stock_map_set` | Upsert one species mapping (slug → product / bay / size / tour spot), or bulk-import UI3D bays.json via `bays`. |
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

### Billing — `src/tools/billing.js`

| Tool | What it does |
| --- | --- |
| `uiiq_billing_info` | Get the tenant's billing information (plan, status, balance). |
| `uiiq_billing_invoices` | List the tenant's invoices. |
| `uiiq_billing_usage` | The tenant's live 'My Plan & Usage' statement: this month's plan base, accruing credit overage (billed in arrears), and the platform fee already… |
| `uiiq_billing_override_get` | List a tenant's per-tenant billing overrides (discount deals, newest first) plus the cost floor and list credit rate for the UI. |
| `uiiq_billing_override_set` | Add a dated per-tenant billing override (discount deal). |
| `uiiq_billing_override_clear` | Deactivate a tenant's billing override(s) — reverting to list pricing and tearing down any Stripe base-%-off coupon. |

### Credits — `src/tools/credits.js`

| Tool | What it does |
| --- | --- |
| `uiiq_credits_balance` | Get the tenant's credit balance and this month's usage. |
| `uiiq_credits_ledger` | Get the tenant's full credit picture from the IQEX ledger: balance, recent transactions, and the purchasable credit packs. |

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

### Reports — `src/tools/report.js`

| Tool | What it does |
| --- | --- |
| `uiiq_report_revenue` | Get UIIQ revenue report. |
| `uiiq_report_usage` | Get UIIQ platform usage stats (sends, contacts, workflows). |

### HR — `src/tools/hr.js`

| Tool | What it does |
| --- | --- |
| `uiiq_hr_staff_list` | List UIIQ staff members. |
| `uiiq_hr_staff_get` | Get full profile for a UIIQ staff member by ID, including roles, training, and leave balance. |
| `uiiq_hr_timesheet_list` | List UIIQ timesheet entries. |
| `uiiq_hr_timesheet_approve` | Approve or reject a UIIQ timesheet entry by ID. |
| `uiiq_hr_clockin_list` | List UIIQ QR clock-in records. |
| `uiiq_hr_leave_list` | List UIIQ leave requests. |
| `uiiq_hr_leave_approve` | Approve or reject a UIIQ leave request. |
| `uiiq_hr_payroll_run` | Fetch the monthly UIIQ Run pay-run for a given month (defaults to current). |
| `uiiq_hr_payroll_export_url` | Returns the URL to download a UIIQ Run pay-run as CSV for the given month. |

### Automations — `src/tools/automation.js`

| Tool | What it does |
| --- | --- |
| `uiiq_automation_list` | List UIIQ automations. |
| `uiiq_automation_toggle` | Enable or disable a UIIQ automation by ID. |
| `uiiq_campaign_list` | List UIIQ email/SMS campaigns. |
| `uiiq_workflow_list` | List UIIQ workflow templates. |
| `uiiq_workflow_instances` | List active UIIQ workflow instances. |
| `uiiq_workflow_trigger` | Trigger a new UIIQ workflow instance from a template. |

328 tools.
