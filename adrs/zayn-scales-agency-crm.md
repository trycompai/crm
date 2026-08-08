# Zayn Scales agency CRM — first pass

Fork target: an internal-only, agency-workflow CRM in the spirit of
GoHighLevel, built on top of the existing agent-first Comp AI CRM.

## What shipped

### New Prisma models (migration `20260808120000_zayn_scales_agency`)

- **ClientAccount** — first-class agency-client entity. Every existing
  record type gains an optional `clientAccountId` so contacts, companies,
  deals, forms and workflows can be filtered by which agency client they
  belong to, without breaking the singleton-workspace model.
- **SmsThread / SmsMessage** — unified inbound + outbound SMS with
  Twilio. Threads keyed on `(ourNumber, theirNumber)`; unread count on
  the thread; every send/receive optionally files an `SMS` activity.
- **FormDefinition / FormField / FormSubmission** — lead-capture forms
  with a public submit endpoint that finds-or-creates a contact and
  files a `FORM_SUBMISSION` activity.
- **WorkflowDefinition / WorkflowRun** — trigger + step-list automation
  scaffold. Trigger kinds: `CONTACT_CREATED`, `DEAL_STAGE_CHANGED`,
  `FORM_SUBMITTED`, `SMS_RECEIVED`, `SCHEDULE`, `MANUAL`. Steps are a
  JSON list (send_sms, send_email, add_tag, wait, agent_task,
  notify_slack). The runner is stubbed — rows enqueue but a worker
  hasn't been wired up yet (see "Not done" below).
- **BookingLink / Booking** — booking-link scaffold, no UI yet.
- Extended `ActivityType` with `SMS`, `FORM_SUBMISSION`, `WORKFLOW`.
- Added `Deal.boardOrder` (int) and `Deal.tags` (string[]) to support
  Kanban.
- Added `Contact.tags` and `Company.tags`.

### New API modules (Nest + tRPC)

- `client-accounts/` — `list`, `byId`, `create`, `update`, `delete`,
  `options`. Adds facet counts for status, includes open-deal count per
  client.
- `sms/` — `list`, `thread`, `send`, `markRead` + a public
  `POST /internal/sms/twilio/inbound` webhook with X-Twilio-Signature
  HMAC-SHA1 verification. `TwilioClient` is capability-off when unset.
- `forms/` — `list`, `byId`, `create`, `update`, `delete`, `submissions`
  + a public `GET/POST /public/forms/:slug` for the embedded form
  runtime.
- `workflows/` — `list`, `byId`, `create`, `update`, `delete`, `runNow`.
- `deals/` — new `board` query and `reorder` mutation for Kanban
  drag-and-drop.

Every router follows the existing pattern (thin router, service does
work, contracts in a separate file, all gated by `AuthMiddleware` except
the two intentionally-public controllers).

### New app pages

- `/clients` — card grid with status tabs (Active / Onboarding / Paused
  / Churned), search, KPIs per client. `/clients/[clientId]` detail with
  quick-link cards to the client's deals, contacts and workflows.
- `/deals?view=board` — Kanban board with native drag-drop between
  stage columns. Reorder writes back through `deals.reorder`, which
  cascades to `deals.setStage` when the stage changes.
- `/inbox` — two-column SMS conversation UI. Reply composer with
  Cmd/Ctrl-Enter to send. Unread count filter. Falls back to a helpful
  message when Twilio isn't configured.
- `/forms` — card grid, copy-public-URL, publish / unpublish, delete.
  New-form sheet with an inline field editor.
- `/workflows` — card grid with status + trigger + step count + run
  count. New-workflow sheet with a step-list editor (SMS / email / tag
  / wait / agent task).
- Overview dashboard adds an agency KPI strip on top: Active clients,
  Unread inbox, Live workflows, Published forms — each a clickable
  card that navigates into that section.

Sidebar rail extended with Clients, Inbox, Forms, Workflows.

### Env additions

- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
  `TWILIO_MESSAGING_SERVICE_SID` — all optional, all declared in
  `env.validation.ts`.

## Design decisions worth recording

- **Sub-accounts are `ClientAccount`, not a tenancy plugin.** The
  existing "singleton workspace" model is preserved. `ClientAccount`
  groups existing records by which agency client they belong to. No
  `WORKSPACE_ID` per client, no per-client auth. This keeps the
  intelligence rules from `docs/api.md` intact.
- **Twilio client is capability-off, never throws.** Follows the
  existing `capabilities.ts` pattern from the agent — if the keys
  aren't set, the SMS pages render a "not configured" state and the
  send mutation returns a 503.
- **Public form submits don't require auth.** The `FormsController`
  uses `@AllowAnonymous()` and IP + user-agent are captured.
- **The workflow runner is a scaffold.** The `WorkflowRun` model,
  enqueue path, and step schema are in place, but no worker loop
  processes queued runs yet. This is the natural next thing to build —
  the pattern to follow is `apps/agent/agent/schedules/dispatch.ts`.
- **Kanban uses native HTML5 drag-drop.** No dnd-kit dependency added;
  the six existing stages are enough columns to not need virtualization.
- **All new UI uses `packages/ui` primitives.** No inline shadcn
  overrides. `EntityLogo`/`PersonAvatar` weren't reused for client
  logos because those URLs aren't in the `next/image` allowlist —
  `<img>` with a biome-ignore is used instead. Adding client-logo hosts
  to `next.config.ts` is the follow-up if we want optimization.
- **tRPC codegen is committed.** The generated `apps/api/src/generated/server.ts`
  was regenerated locally with `bun run --filter=api trpc:generate`
  after each router change; it must not be regenerated at Vercel build
  time (GLIBC version issue documented in `docs/api.md`).

## Not done — the honest list

- **No workflow worker.** `WorkflowRun` rows queue but nothing
  processes them. Pattern: extend `apps/agent/agent/schedules/dispatch.ts`
  or add a fourth Nest cron controller that leases `QUEUED` rows,
  interprets the step list, and applies actions.
- **No form-submit → workflow trigger.** `formDefinition.workflowIdOnSubmit`
  is stored but not fired.
- **Forms have no edit UI yet** — you can create/publish/delete but not
  edit fields after creation. `forms.update` handles it on the API
  side.
- **Booking links** — model exists, no UI. The pattern to follow is
  the existing `google/calendar` sync.
- **No agent tools yet for SMS / forms / workflows.** The agent could
  send SMS, look at inbox threads and trigger workflows — those are
  new tools in `apps/agent/agent/tools/`.
- **Twilio webhook signature URL** — uses `API_URL` env var; if the
  webhook lands via a different hostname (e.g. a Twilio-specific
  Cloudflare Tunnel), the signature check will fail. Document this at
  deploy time.
- **Kanban drop always appends to end of column.** Drop-between-cards
  and same-column reorder aren't implemented; the `boardOrder` column
  is set to `col.deals.length` on drop.

## Verified

- `bun run --filter=api check-types` — passes
- `bun run --filter=app check-types` — passes
- `bun run --filter=api lint` — passes (4 warnings, all pre-existing)
- `bun run --filter=app lint` — passes (1 warning, pre-existing)
- `bun run --filter=app test` — 119 pass, 0 fail
- `bun run --filter=api test` — DB-dependent tests fail in this
  container (no Postgres running); non-DB tests pass. Same as before
  this branch.

Migration was written by hand and not applied against a live DB in
this session. `bun run db:migrate` on a real Postgres is the next step
before running the agent or app against real data.
