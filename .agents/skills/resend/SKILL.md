---
name: resend
description: Use when working with the Resend email API — sending transactional emails (single or batch), receiving inbound emails via webhooks, managing email templates, tracking delivery events, managing domains, contacts, broadcasts, webhooks, API keys, automations, events, viewing API request logs, or setting up the Resend SDK. Always use this skill when the user mentions Resend, even for simple tasks like "send an email with Resend" — the skill contains critical gotchas (idempotency keys, webhook verification, template variable syntax) that prevent common production issues.
license: MIT
metadata:
    author: resend
    version: "3.5.2"
    homepage: https://resend.com/agent-skills
    source: https://github.com/resend/resend-skills
    openclaw:
        primaryEnv: RESEND_API_KEY
        requires:
            env:
                - RESEND_API_KEY
        envVars:
            - name: RESEND_API_KEY
              required: true
              description: Resend API key for sending and receiving emails
            - name: RESEND_WEBHOOK_SECRET
              required: false
              description: Webhook signing secret for verifying event payloads
        links:
            repository: https://github.com/resend/resend-skills
            documentation: https://resend.com/docs/resend-skill
inputs:
    - name: RESEND_API_KEY
      description: Resend API key for sending and receiving emails. Get yours at https://resend.com/api-keys
      required: true
    - name: RESEND_WEBHOOK_SECRET
      description: Webhook signing secret for verifying event payloads. Found in the Resend dashboard under Webhooks after creating an endpoint.
      required: false
references:
    - sending
    - receiving.md
    - templates.md
    - webhooks.md
    - domains.md
    - contacts.md
    - broadcasts.md
    - api-keys.md
    - logs.md
    - contact-properties.md
    - segments.md
    - topics.md
    - automations.md
    - events.md
    - installation.md
    - fetch-all-templates.mjs
---

# Resend

## Quick Send — Node.js

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send(
  {
    from: 'Acme <onboarding@resend.dev>',
    to: ['delivered@resend.dev'],
    subject: 'Hello World',
    html: '<p>Email body here</p>',
  },
  { idempotencyKey: `welcome-email/${userId}` }
);

if (error) {
  console.error('Failed:', error.message);
  return;
}
console.log('Sent:', data.id);
```

**Key gotcha:** The Resend Node.js SDK does NOT throw exceptions — it returns `{ data, error }`. Always check `error` explicitly instead of using try/catch for API errors.

## Quick Send — Python

```python
import resend
import os

resend.api_key = os.environ["RESEND_API_KEY"]

email = resend.Emails.send({
    "from": "Acme <onboarding@resend.dev>",
    "to": ["delivered@resend.dev"],
    "subject": "Hello World",
    "html": "<p>Email body here</p>",
}, idempotency_key=f"welcome-email/{user_id}")
```

### Single vs Batch Decision

| Choose | When |
|--------|------|
| **Single** (`POST /emails`) | 1 email, needs attachments, needs scheduling |
| **Batch** (`POST /emails/batch`) | 2-100 distinct emails, no attachments, no scheduling |

Batch is atomic — if one email fails validation, the entire batch fails. Always validate before sending. Batch does NOT support attachments or `scheduled_at`.

### Idempotency Keys (Critical for Retries)

Prevent duplicate emails when retrying failed requests:

| Key Facts | |
|-----------|---|
| **Format (single)** | `<event-type>/<entity-id>` (e.g., `welcome-email/user-123`) |
| **Format (batch)** | `batch-<event-type>/<batch-id>` (e.g., `batch-orders/batch-456`) |
| **Expiration** | 24 hours |
| **Max length** | 256 characters |
| **Same key + same payload** | Returns original response without resending |
| **Same key + different payload** | Returns 409 error |

## Quick Receive (Node.js)

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const payload = await req.text(); // Must use raw text, not req.json()

  const event = resend.webhooks.verify({
    payload,
    headers: {
      'svix-id': req.headers.get('svix-id'),
      'svix-timestamp': req.headers.get('svix-timestamp'),
      'svix-signature': req.headers.get('svix-signature'),
    },
    secret: process.env.RESEND_WEBHOOK_SECRET,
  });

  if (event.type === 'email.received') {
    // Webhook has metadata only — call API for body
    const { data: email } = await resend.emails.receiving.get(
      event.data.email_id
    );
    console.log(email.text);
  }

  return new Response('OK', { status: 200 });
}
```

**Key gotcha:** Webhook payloads do NOT contain the email body. You must call `resend.emails.receiving.get()` separately.

## What Do You Need?

| Task | Reference |
|------|-----------|
| **Send a single email** | [sending/overview.md](references/sending/overview.md) — parameters, deliverability, testing |
| **Send batch emails** | [sending/overview.md](references/sending/overview.md) → [sending/batch-email-examples.md](references/sending/batch-email-examples.md) |
| **Full SDK examples** (Node.js, Python, Go, cURL) | [sending/single-email-examples.md](references/sending/single-email-examples.md) |
| **Idempotency, retries, error handling** | [sending/best-practices.md](references/sending/best-practices.md) |
| **Get, list, reschedule, cancel emails** | [sending/email-management.md](references/sending/email-management.md) |
| **Receive inbound emails** | [receiving.md](references/receiving.md) — domain setup, webhooks, attachments |
| **Manage templates** (CRUD, variables) | [templates.md](references/templates.md) — lifecycle, aliases, pagination |
| **Set up webhooks** (events, verification) | [webhooks.md](references/webhooks.md) — verification, CRUD, retry schedule, IP allowlist |
| **Manage domains** (create, verify, claim, DNS) | [domains.md](references/domains.md) — regions, TLS, tracking, claiming, capabilities |
| **Manage contacts** (CRUD, properties) | [contacts.md](references/contacts.md) — segments, topics, custom properties, bulk CSV import |
| **Send broadcasts** (marketing campaigns) | [broadcasts.md](references/broadcasts.md) — lifecycle, scheduling, template variables |
| **Manage API keys** | [api-keys.md](references/api-keys.md) — permission scoping, domain restrictions |
| **View API request logs** | [logs.md](references/logs.md) — list and retrieve API call history, debugging |
| **Define contact properties** | [contact-properties.md](references/contact-properties.md) — custom fields for contacts |
| **Manage segments** (contact groups) | [segments.md](references/segments.md) — broadcast targeting, contact grouping |
| **Manage topics** (subscriptions) | [topics.md](references/topics.md) — opt-in/out preferences, broadcast filtering |
| **Create automations** (event-driven workflows) | [automations.md](references/automations.md) — steps, connections, runs, conditions |
| **Define and send events** (automation triggers) | [events.md](references/events.md) — schemas, payloads, contact association |
| **Install SDK** (8+ languages) | [installation.md](references/installation.md) |
| **Set up an AI agent inbox** | Install the `agent-email-inbox` skill — covers security levels for untrusted input |

## SDK Version Requirements

Always install the latest SDK version. These are the minimum versions for full functionality (sending, receiving, webhook verification):

| Language | Package | Min Version | Install |
|----------|---------|-------------|---------|
| Node.js | `resend` | >= 6.14.0 | `npm install resend` |
| Python | `resend` | >= 2.34.0 | `pip install resend` |
| Go | `resend-go/v3` | >= 3.11.0 | `go get github.com/resend/resend-go/v3` |
| Ruby | `resend` | >= 1.6.0 | `gem install resend` |
| PHP | `resend/resend-php` | >= 1.1.0 | `composer require resend/resend-php` |
| Rust | `resend-rs` | >= 0.26.1 | `cargo add resend-rs` |
| Java | `resend-java` | >= 4.16.0 | See [installation.md](references/installation.md) |
| .NET | `Resend` | >= 0.2.1 | `dotnet add package Resend` |

> **If the project already has a Resend SDK installed**, check the version and upgrade if it's below the minimum. Older SDKs may be missing `webhooks.verify()`, `emails.receiving.get()`, or `domains.claims.*`.

See [installation.md](references/installation.md) for full installation commands, language detection, and cURL fallback.

## Common Setup

### API Key

Store in environment variable — never hardcode:
```bash
export RESEND_API_KEY=re_xxxxxxxxx
```

Get your key at [resend.com/api-keys](https://resend.com/api-keys).

### Detect Project Language

Check for these files: `package.json` (Node.js), `requirements.txt`/`pyproject.toml` (Python), `go.mod` (Go), `Gemfile` (Ruby), `composer.json` (PHP), `Cargo.toml` (Rust), `pom.xml`/`build.gradle` (Java), `*.csproj` (.NET).

## Common Mistakes

| # | Mistake | Fix |
|---|---------|-----|
| 1 | **Retrying without idempotency key** | Always include idempotency key — prevents duplicate sends on retry. Format: `<event-type>/<entity-id>` |
| 2 | **Not verifying webhook signatures** | Always verify with `resend.webhooks.verify()` — unverified events can't be trusted |
| 3 | **Template variable name mismatch** | Variable names are case-sensitive — must match the template definition exactly. Use triple mustache `{{{VAR}}}` syntax |
| 4 | **Expecting email body in webhook payload** | Webhooks contain metadata only — call `resend.emails.receiving.get()` for body content |
| 5 | **Using try/catch for Node.js SDK errors** | SDK returns `{ data, error }` — check `error` explicitly, don't wrap in try/catch |
| 6 | **Using batch for emails with attachments** | Batch doesn't support attachments — use single sends instead |
| 7 | **Testing with fake emails (test@gmail.com)** | Use `delivered@resend.dev` — fake addresses bounce and hurt reputation |
| 8 | **Sending with draft template** | Templates must be published before sending — call `.publish()` first |
| 9 | **`html` + `template` in same send call** | Mutually exclusive — remove `html`/`text`/`react` when using template |
| 10 | **MX record not lowest priority for inbound** | Ensure Resend's MX has the lowest number (highest priority) or emails won't route |
| 11 | **403 when sending from `resend.dev`** | The default `onboarding@resend.dev` is a sandbox — it can only deliver to your Resend account email. Verify your own domain first |
| 12 | **403 domain mismatch** | The `from` address domain must exactly match a verified domain. Verified `send.acme.com` but sending from `user@acme.com` will fail |
| 13 | **Calling Resend API from the browser (CORS)** | The API does not support CORS — this is intentional to protect your API key. Always call from server-side (API routes, serverless functions) |
| 14 | **401 `restricted_api_key`** | A sending-only API key was used on a non-sending endpoint (domains, contacts, etc.). Create a full-access key instead |

## Cross-Cutting Concerns

### Send + Receive Together

Auto-replies, email forwarding, or any receive-then-send workflow requires both capabilities:
1. Set up inbound domain first (see [receiving.md](references/receiving.md))
2. Set up sending (see [sending/overview.md](references/sending/overview.md))
3. Note: batch sending does NOT support attachments or scheduling — use single sends when forwarding with attachments

### AI Agent Inbox

If your system processes untrusted email content and takes actions (refunds, database changes, forwarding), install the `agent-email-inbox` skill. This applies whether or not AI is involved — any system interpreting freeform email content from external senders needs security measures.

### Marketing Emails

The sending capabilities in this skill are for **transactional email** (receipts, confirmations, notifications). For marketing campaigns to large subscriber lists with unsubscribe links and engagement tracking, use Resend Broadcasts — see [broadcasts.md](references/broadcasts.md) for the API.

### Domain Warm-up

New domains must gradually increase sending volume. Day 1 limit: ~150 emails (new domain) or ~1,000 (existing domain). See the warm-up schedule in [sending/overview.md](references/sending/overview.md).

### Testing

**Never test with fake addresses at real email providers** (test@gmail.com, fake@outlook.com) — they bounce and destroy sender reputation.

| Address | Result |
|---------|--------|
| `delivered@resend.dev` | Simulates successful delivery |
| `bounced@resend.dev` | Simulates hard bounce |
| `complained@resend.dev` | Simulates spam complaint |

### Suppression List

Resend automatically suppresses hard-bounced and spam-complained addresses. Sending to suppressed addresses fires the `email.suppressed` webhook event instead of attempting delivery. Manage in Dashboard → Suppressions.

### Webhook Event Types

| Event | Trigger |
|-------|---------|
| `email.sent` | API request successful |
| `email.delivered` | Reached recipient's mail server |
| `email.bounced` | Permanently rejected (hard bounce) |
| `email.complained` | Recipient marked as spam |
| `email.opened` / `email.clicked` | Recipient engagement |
| `email.delivery_delayed` | Soft bounce, Resend retries |
| `email.received` | Inbound email arrived |
| `domain.*` / `contact.*` | Domain/contact changes |

See [webhooks.md](references/webhooks.md) for full details, signature verification, and retry schedule.

## Error Handling Quick Reference

| Code | Action |
|------|--------|
| 400, 422 | Fix request parameters, don't retry |
| 401 | Check API key — `restricted_api_key` means sending-only key used on non-sending endpoint |
| 403 | Verify domain ownership — common causes: `resend.dev` sandbox, `from` domain mismatch, unverified domain |
| 409 | Idempotency conflict — use new key or fix payload |
| 429 | Rate limited — retry with exponential backoff (default rate limit: 2 req/s) |
| 500 | Server error — retry with exponential backoff |

## Resources

- [Resend Documentation](https://resend.com/docs)
- [API Reference](https://resend.com/docs/api-reference)
- [Dashboard](https://resend.com/emails)
