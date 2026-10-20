# Spec — Extensible MCP integrations

Status: ready for implementation.

This work adds reusable MCP integrations to the CRM.

Use [comp-neo](https://github.com/trycompai/comp-neo) as the reference implementation.
Use its `staging` branch because that branch contains the current integration system.

Read these Neo areas before implementation:

- `packages/mcp-integrations`
- `apps/api/src/modules/integrations/mcp`
- `apps/agents/compliance/agent/lib/agent-connections.ts`
- `apps/web/app/[org-slug]/(workspace)/settings/integrations`

Port the behavior into CRM architecture.
Do not add comp-neo as a package dependency.

## Outcome

A workspace owner connects a supported platform once.
The agent builder shows the active connection as a capability.
The builder grants only the tools that one agent needs.
The deployment review shows every granted tool and access level.
The runner calls only tools approved in that deployed version.
Disconnecting a platform blocks new calls immediately.

The first complete integration is Linear.
Add Supabase and Vercel after the Linear flow passes every acceptance test.

## Product rules

1. A connection is a capability.
2. An agent owns the automation.
3. Settings manages connections only.
4. The builder chooses how an agent uses a connection.
5. Deployment is the approval boundary for unattended runs.
6. Every external call uses the deployed version's exact grant.
7. New or changed vendor tools stay blocked until review.

## User flow

### Connect a platform

1. The owner opens **Settings → Connections**.
2. The owner selects a platform card.
3. The owner chooses **Read only** or **Read and write**.
4. The CRM shows the requested access in plain language.
5. The owner continues to the platform's OAuth screen.
6. The platform returns the owner to the CRM.
7. The card shows **Connected** after token storage and tool discovery succeed.

The page uses **Brings in** and **Sends** for capability descriptions.
The page does not show raw OAuth scope names as primary copy.
The management view shows scopes for technical review.

Only owners and admins can connect, reconnect, or disconnect a platform.
The server enforces this rule at every entry point.

### Add a connection to an agent

1. The user opens the agent builder.
2. The user tags a connected platform.
3. The builder reads the platform's reviewed tool inventory.
4. The builder selects the smallest tool set that completes the requested work.
5. The builder explains every selected tool in plain language.
6. The saved version includes the exact tool names and fingerprints.
7. The review screen shows the platform, tools, access, and possible changes.
8. The user deploys the immutable version.

An unavailable platform produces a connect prompt.
A disconnected platform never produces a usable runtime tool.

### Run an agent

1. The runner loads the deployed manifest.
2. The runner resolves the current connection.
3. The runner checks the connection status and access level.
4. The runner checks the tool name and fingerprint.
5. The runner writes an action ledger row before a changing call.
6. The runner calls the platform through its MCP server.
7. The runner stores the result state without storing secrets.

The runner refuses every call outside the deployed grant.
The runner refuses changed tools until a new version receives approval.

## Architecture

### Shared catalog

Create `packages/mcp-integrations`.
Use one file for each supported platform.

Each catalog entry contains:

- A stable slug.
- The platform name.
- The MCP resource URL.
- Allowed authorization server origins.
- Allowed OAuth endpoint origins.
- Read-only scopes.
- Read-and-write scopes.
- Risk overrides for known tools.
- Allowed documentation hosts.
- Source links and the last review date.

Use `integrations.sh` for discovery.
Treat the vendor's live metadata and documentation as the authority.

The catalog contains technical facts only.
User-facing descriptions live in the app.

### Authentication

Use OAuth dynamic client registration and PKCE with `S256`.
Reject a platform without both features.
Reject every non-HTTPS endpoint.
Reject every unapproved issuer or endpoint origin.

Keep OAuth state short-lived and single-use.
Bind the state to the user, platform, access mode, and return path.

Store access tokens and refresh tokens in encrypted form.
Never return either token to the browser, model, transcript, or log.

Keep configuration in the root `.env`.
Document every new variable in `.env.example`.
A missing encryption key disables MCP connections without breaking the CRM.

`packages/auth` owns OAuth registration, exchange, refresh, and revocation.
The API owns authenticated control endpoints and connection state.

### API boundary

The API exposes tRPC procedures for these operations:

- List catalog entries and connection states.
- Start a connection.
- Read one connection.
- Reconnect a connection.
- Disconnect a connection.
- Read the cached tool inventory.

The API does not call MCP tools.
The API does not classify tool risk.
The API does not decide which tools an agent needs.

The API writes a durable agent task after a successful connection.
The task tells the agent to discover and cache the tool inventory.

### Agent boundary

The agent owns the MCP client and every vendor tool call.
Use Eve dynamic connections for the active platform set.
Read the installed Eve connection guide before writing this code.

The agent parses every MCP response at the boundary.
The agent treats tool descriptions and results as untrusted data.
The agent never follows instructions found in a tool result.

### Data model

Add `McpConnection` with these facts:

- Platform slug.
- Connection status.
- Access mode.
- Granted scopes.
- Encrypted access token.
- Encrypted refresh token.
- Token expiry.
- Connecting user.
- Connected time.
- Last successful call time.
- Last error code.

Add `McpClientRegistration` for dynamic OAuth client registrations.
Reuse one valid registration for the same platform metadata.

Add `McpToolSnapshot` with these facts:

- Connection ID.
- Tool name.
- Description.
- Input schema.
- MCP annotations.
- Stable fingerprint.
- Last seen time.
- Review state.

Parse every JSON column with Zod at its read boundary.
Keep shared schemas in `packages/validation/src`.

### Agent manifest

Extend integration resource IDs with `mcp:<platform-slug>`.

Add an MCP tool action to the manifest.
The action contains the platform slug and approved tools.

Each approved tool contains:

- Its exact name.
- Its reviewed fingerprint.
- Its call kind.
- A plain summary.

Call kinds are `read`, `change`, and `risky`.
The manifest schema rejects duplicate platform and tool grants.

The review screen derives its access list from this manifest.
The runtime parses the manifest before it reads any field.

### Tool fingerprints

Build a fingerprint from the tool name, description, schema, and annotations.
Use stable JSON ordering before hashing.

A new tool starts blocked.
A changed fingerprint starts blocked.
A removed tool makes the affected agent version unavailable.

Tool review creates a new agent version.
It never changes a deployed version in place.

### Call safety

Classify each tool before the builder can grant it.
Use MCP annotations, the tool name, and catalog risk overrides.

Treat these operations as risky:

- Deletes and irreversible changes.
- Access, role, member, or permission changes.
- Production deployments and rollbacks.
- Billing and purchase operations.
- Code, shell, or SQL execution.
- Reads of secrets, tokens, logs, or raw customer data.

An unknown tool is risky.
A failed classification is risky.

Read-only connections can grant only read tools.
Read-and-write connections can grant all reviewed tools.

Unattended runs execute only exact deployed grants.
Interactive sessions ask before ungranted changes.

Write every changing call to `AgentAction` before execution.
Use Eve's call ID as the replay key.
Record success, failure, and the external tool name.
Do not record secret arguments or raw sensitive results.

### Network safety

Fetch metadata through `@crm/db/safe-fetch`.
Apply the same SSRF rules to MCP endpoints.
Resolve and validate every redirect target.

Keep timeouts, size limits, and retry limits in one integration config module.
Use `as const` for all configuration values.

Cap tool results before they enter the model or event archive.
Return a clear truncation marker with the retained data.

## Adding a catalog integration

Complete every step for each platform.

1. Find the platform on `integrations.sh`.
2. Read the platform's official MCP and OAuth documentation.
3. Read the live protected-resource metadata.
4. Read the live authorization-server metadata.
5. Confirm dynamic client registration and PKCE `S256`.
6. Confirm every issuer, endpoint origin, scope, and MCP resource URL.
7. Read the live tool list and tool documentation.
8. Add catalog risk overrides for misleading tools.
9. Add the catalog entry, display copy, and brand mark.
10. Add unit tests for metadata, scopes, and risk overrides.
11. Complete both access modes with a test account.
12. Run at least one read and one approved change.
13. Add user documentation in the same pull request.

Stop the addition when the platform needs a manually registered OAuth client.
Stop the addition when the platform requires a private redirect allowlist.
Record the blocker in the catalog research notes.

## Delivery plan

### Phase 1 — Linear connection

Build the catalog, data model, OAuth flow, and connection page.
Connect Linear with read-only and read-and-write access.
Discover and cache Linear tools through the agent.

Done means both connection modes survive token refresh and server restart.

### Phase 2 — Builder grants

Show Linear in builder resource search.
Let the builder select exact Linear tools.
Show the grants on the version review screen.

Done means deployment refuses an unreadable or stale tool grant.

### Phase 3 — Runtime calls

Build Eve dynamic connections and manifest enforcement.
Add action ledger support for MCP calls.
Block disconnected, changed, and ungranted tools.

Done means a replay cannot execute one changing call twice.

### Phase 4 — Catalog growth

Add Supabase and Vercel through the documented catalog process.
Fix the shared platform when either integration exposes a general defect.

Done means a new catalog entry needs no new runtime branch.

## Tests

Add unit tests for these cases:

- Catalog parsing and stable slugs.
- Origin and resource validation.
- Scope selection for both access modes.
- Tool classification and risk overrides.
- Stable tool fingerprints.
- Manifest parsing and duplicate rejection.

Add integration tests for these cases:

- Owner and admin connection access.
- Member connection refusal.
- OAuth state expiry and replay refusal.
- Token encryption and refresh.
- Disconnect during an agent run.
- Changed tool refusal.
- Read-only mutation refusal.
- Action replay protection.
- Missing optional configuration.

Add one end-to-end test for each catalog platform.
The test connects, deploys one agent, runs one read, and disconnects.

## Release criteria

The work is complete when every statement below is true.

- Linear, Supabase, and Vercel connect from Settings.
- The builder lists only active connections.
- A deployed version names every allowed MCP tool.
- A new or changed tool never runs without review.
- Read-only access blocks every changing call.
- Disconnecting blocks the next call.
- Tokens never appear in browser data, logs, prompts, or events.
- Missing MCP configuration leaves the rest of CRM operational.
- Tests cover OAuth, authorization, manifests, tool drift, and replay safety.
- User documentation explains connection access and agent grants.

## Later work

Custom MCP server URLs are outside the first release.
API-key connections are outside the first release.
Per-user connections are outside the first release.
Public integration REST endpoints are outside the first release.
Chat-wide permission modes are outside the first release.

Add custom servers after the catalog flow proves its security boundaries.
