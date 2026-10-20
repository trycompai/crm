# MCP catalog research

Checked on 2026-10-20.

## Supabase

- Resource: `https://mcp.supabase.com/mcp`.
- Authorization server: `https://api.supabase.com`.
- Dynamic registration: supported.
- PKCE: `S256` supported.
- Read-only transport: `https://mcp.supabase.com/mcp?read_only=true`.
- Protected resource metadata: `https://mcp.supabase.com/.well-known/oauth-protected-resource/mcp`.
- Authorization metadata: `https://api.supabase.com/.well-known/oauth-authorization-server`.
- Official tools: `https://supabase.com/docs/guides/ai-tools/mcp`.
- Discovery source: `https://integrations.sh/supabase/supabase/`.

The catalog includes Supabase.
The user must complete OAuth before live tool tests can run.

## Vercel

- Resource: `https://mcp.vercel.com/`.
- Authorization server: `https://vercel.com`.
- Dynamic registration: advertised.
- PKCE: `S256` supported.
- Protected resource metadata: `https://mcp.vercel.com/.well-known/oauth-protected-resource`.
- Authorization metadata: `https://vercel.com/.well-known/oauth-authorization-server`.
- Official tools: `https://vercel.com/docs/agent-resources/vercel-mcp`.

Vercel limits access to reviewed MCP clients.
Comp AI CRM is not in Vercel's supported client list.
The catalog must not expose a connection that Vercel refuses.

Blocker: submit Vercel's client review form.
Add Vercel only after Vercel approves Comp AI CRM.
