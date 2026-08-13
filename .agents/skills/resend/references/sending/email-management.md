# Email Management

## Overview

After sending, emails can be retrieved, listed, rescheduled, or cancelled. Updates are limited to `scheduled_at` only — content cannot be changed after creation.

## SDK Methods

### Node.js

| Operation | Method | Notes |
|-----------|--------|-------|
| Get | `resend.emails.get(id)` | Returns full email details and status |
| List | `resend.emails.list({ limit, offset })` | Paginated list of sent emails |
| Update | `resend.emails.update({ id, scheduledAt })` | Reschedule only — no content changes |
| Cancel | `resend.emails.cancel(id)` | Cancel a scheduled email before it sends |

### Python

| Operation | Method |
|-----------|--------|
| Get | `resend.Emails.get(id)` |
| List | `resend.Emails.list(params)` |
| Update | `resend.Emails.update(params)` — params: `{ "id": ..., "scheduled_at": ... }` |
| Cancel | `resend.Emails.cancel(id)` |

## Examples

### Get Email

```typescript
// Node.js — always destructure { data, error }
const { data, error } = await resend.emails.get('email_abc123');
if (error) {
  console.error(error);
  return;
}
console.log(data.status); // 'delivered', 'bounced', 'scheduled', etc.
```

```python
# Python — returns data directly
email = resend.Emails.get("email_abc123")
print(email["status"])
```

### Reschedule a Scheduled Email

```typescript
const { data, error } = await resend.emails.update({
  id: 'email_abc123',
  scheduledAt: '2026-04-01T09:00:00Z',
});
if (error) console.error(error);
```

```python
resend.Emails.update({
    "id": "email_abc123",
    "scheduled_at": "2026-04-01T09:00:00Z",
})
```

### Cancel a Scheduled Email

```typescript
const { data, error } = await resend.emails.cancel('email_abc123');
if (error) console.error(error);
```

```python
resend.Emails.cancel("email_abc123")
```

## Retrieving Attachments

List and download attachments for sent emails. Returns metadata and a signed download URL.

### SDK Methods

| Operation | Node.js | Python |
|-----------|---------|--------|
| List | `resend.emails.attachments.list({ emailId })` | `resend.Emails.Attachments.list(email_id)` |
| Get | `resend.emails.attachments.get({ emailId, attachmentId })` | `resend.Emails.Attachments.get(email_id, attachment_id)` |

### Examples

```typescript
// List all attachments for a sent email
const { data: attachments } = await resend.emails.attachments.list({
  emailId: 'email_abc123',
});

for (const att of attachments.data) {
  console.log(att.filename);      // 'invoice.pdf'
  console.log(att.content_type);   // 'application/pdf'
  console.log(att.size);           // bytes
  console.log(att.download_url);   // signed URL, expires at att.expires_at
}

// Get a single attachment
const { data: attachment } = await resend.emails.attachments.get({
  emailId: 'email_abc123',
  attachmentId: 'att_def456',
});

// Download the content
const response = await fetch(attachment.download_url);
const buffer = await response.arrayBuffer();
```

**Important:** `download_url` expires (see `expires_at` field). Call the API again for a fresh URL if needed.

### Attachment Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Attachment ID |
| `filename` | string | Original filename |
| `content_type` | string | MIME type |
| `content_id` | string | Content ID for inline attachments |
| `content_disposition` | `"inline"` \| `"attachment"` | Display mode |
| `download_url` | string | Signed download URL |
| `expires_at` | string | When the download URL expires |
| `size` | number | Size in bytes |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Trying to update `subject`, `html`, or `to` | Only `scheduledAt` can be updated — cancel and resend for content changes |
| Cancelling an already-sent email | Cancel only works on emails with `scheduled` status |
| Cancelling too late | Cancel before the `scheduled_at` time — there's a brief processing window before send |
| Not checking `error` in Node.js | SDK returns `{ data, error }`, does not throw — always destructure and check |
| Using `.list()` without pagination | Pass `limit` and `offset` to paginate through results |
