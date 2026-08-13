# Sending Emails with Resend

## Overview

Resend provides two endpoints for sending emails:

| Approach | Endpoint | Use Case |
|----------|----------|----------|
| **Single** | `POST /emails` | Individual transactional emails, emails with attachments, scheduled sends |
| **Batch** | `POST /emails/batch` | Multiple distinct emails in one request (max 100), bulk notifications |

**Choose batch when:**
- Sending 2+ distinct emails at once
- Reducing API calls is important (by default, rate limit is 2 requests per second)
- No attachments or scheduling needed

**Choose single when:**
- Sending one email
- Email needs attachments
- Email needs to be scheduled
- Different recipients need different timing

## Quick Start

1. **Detect project language** from config files (package.json, requirements.txt, go.mod, etc.)
2. **Install SDK** (preferred) or use cURL — See [../installation.md](../installation.md)
3. **Choose single or batch** based on the decision matrix above
4. **Implement best practices** — Idempotency keys, error handling, retries. See [best-practices.md](best-practices.md)

## Single Email

**Endpoint:** `POST /emails` (prefer SDK over cURL)

### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | string | Sender address. Format: `"Name <email@domain.com>"` |
| `to` | string[] | Recipient addresses (max 50) |
| `subject` | string | Email subject line |
| `html` or `text` | string | Email body content |

### Optional Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `cc` | string[] | CC recipients |
| `bcc` | string[] | BCC recipients |
| `reply_to`* | string[] | Reply-to addresses |
| `scheduled_at`* | string | Schedule send time (ISO 8601) |
| `attachments` | array | File attachments (max 40MB total) |
| `tags` | array | Key/value pairs for tracking (see [Tags](#tags)) |
| `headers` | object | Custom headers |
| `topic_id`* | string | Scope email to a topic — if the recipient contact has opted out of this topic, the email is silently skipped |

*Parameter naming varies by SDK (e.g., `replyTo` in Node.js, `reply_to` in Python).

See [single-email-examples.md](single-email-examples.md) for full SDK implementations with error handling and retry logic.

## Batch Email

**Endpoint:** `POST /emails/batch` (prefer SDK over cURL)

### Limitations

- **No attachments** — Use single sends for emails with attachments
- **No scheduling** — Use single sends for scheduled emails
- **Atomic** — If one email fails validation, the entire batch fails
- **Max 100 emails** per request
- **Max 50 recipients** per individual email in the batch

### Pre-validation

Since the entire batch fails on any validation error, validate all emails before sending:
- Check required fields (from, to, subject, html/text)
- Validate email formats
- Ensure batch size <= 100

See [batch-email-examples.md](batch-email-examples.md) for full SDK implementations with validation, chunking, and retry logic.

## Large Batches (100+ Emails)

For sends larger than 100 emails, chunk into multiple batch requests:

1. **Split into chunks** of 100 emails each
2. **Use unique idempotency keys** per chunk: `<batch-prefix>/chunk-<index>`
3. **Send chunks in parallel** for better throughput
4. **Track results** per chunk to handle partial failures

See [batch-email-examples.md](batch-email-examples.md) for complete chunking implementations.

## Deliverability

Follow these practices to maximize inbox placement.

For more help with deliverability, install the email-best-practices skill with `npx skills add resend/email-best-practices`.

### Required

| Practice | Why |
|----------|-----|
| **Valid SPF, DKIM, DMARC record** | Authenticate the email and prevent spoofing |
| **Links match sending domain** | If sending from `@acme.com`, link to `https://acme.com` — mismatched domains trigger spam filters |
| **Include plain text version** | Use both `html` and `text` parameters for accessibility and deliverability |
| **Avoid "no-reply" addresses** | Use real addresses (e.g., `support@`) — improves trust signals |
| **Keep body under 102KB** | Gmail clips larger messages |

### Recommended

| Practice | Why |
|----------|-----|
| **Use subdomains** | Send transactional from `notifications.acme.com`, marketing from `mail.acme.com` — protects reputation |
| **Disable tracking for transactional** | Open/click tracking can trigger spam filters for password resets, receipts, etc. |

## Tracking (Opens & Clicks)

Tracking is configured at the **domain level** in the Resend dashboard, not per-email.

| Setting | How it works | Recommendation |
|---------|--------------|----------------|
| **Open tracking** | Inserts 1x1 transparent pixel | Disable for transactional emails |
| **Click tracking** | Rewrites links through redirect | Disable for sensitive emails |

Configure via dashboard: Domain → Configuration → Click/Open Tracking.

To track different email types separately (e.g., tracking on for marketing, off for transactional), use **separate subdomains**.

## Tags

Tags are key/value pairs that help you track and filter emails.

```typescript
tags: [
  { name: 'user_id', value: 'usr_123' },
  { name: 'email_type', value: 'welcome' },
]
```

**Constraints:** Tag names and values can only contain ASCII letters, numbers, underscores, or dashes. Max 256 characters each.

## Templates

Use pre-built templates instead of sending HTML with each request:

```typescript
const { data, error } = await resend.emails.send({
  from: 'Acme <hello@acme.com>',
  to: ['delivered@resend.dev'],
  subject: 'Welcome!',
  template: {
    id: 'tmpl_abc123',       // or alias: 'welcome-email'
    variables: {
      USER_NAME: 'John',     // Case-sensitive! Must match template exactly.
    }
  }
});
```

Cannot combine `template` with `html`, `text`, or `react` — mutually exclusive. See [../templates.md](../templates.md) for full template management.

## Testing

**Avoid testing with fake addresses at real email providers** — they bounce and destroy sender reputation.

| Method | Address | Result |
|--------|---------|--------|
| **Delivered** | `delivered@resend.dev` | Simulates successful delivery |
| **Bounced** | `bounced@resend.dev` | Simulates hard bounce |
| **Complained** | `complained@resend.dev` | Simulates spam complaint |
| **Your own email** | Your actual address | Real delivery test |

## Domain Warm-up

New domains must gradually increase sending volume to establish reputation.

**New domain schedule:**

| Day | Messages per day |
|-----|-----------------|
| 1 | Up to 150 |
| 2 | Up to 250 |
| 3 | Up to 400 |
| 4 | Up to 700 |
| 5 | Up to 1,000 |
| 6 | Up to 1,500 |
| 7 | Up to 2,000 |

**Existing domain schedule:**

| Day | Messages per day |
|-----|-----------------|
| 1 | Up to 1,000 |
| 2 | Up to 2,500 |
| 3–4 | Up to 5,000 |
| 5–6 | Up to 7,500 |
| 7 | Up to 10,000 |

Monitor: bounce rate < 4%, spam complaint rate < 0.08%.

## Suppression List

Resend automatically manages a suppression list. Addresses are added when emails hard bounce or recipients mark as spam. Resend won't attempt delivery to suppressed addresses — the `email.suppressed` webhook event fires instead. Manage in Dashboard → Suppressions.

## Notes

- The `from` address must use a verified domain
- If the sending address cannot receive replies, set the `reply_to` parameter
- Node.js SDK supports `react` parameter for React Email components
- Resend returns `{ error, data }` — data is `{ id: "email-id" }` on success (single) or array of IDs (batch)
