# Broadcasts

Send emails to audience segments. Broadcasts follow a two-step lifecycle: **create** (draft) then **send**.

## SDK Methods

| Operation | Node.js | Python |
|-----------|---------|--------|
| Create | `resend.broadcasts.create(params)` | `resend.Broadcasts.create(params)` |
| Get | `resend.broadcasts.get(id)` | `resend.Broadcasts.get(id)` |
| List | `resend.broadcasts.list(params)` | `resend.Broadcasts.list(params)` |
| Send | `resend.broadcasts.send(id, params?)` | `resend.Broadcasts.send(params)` |
| Cancel | `resend.broadcasts.cancel(id)` | `resend.Broadcasts.cancel(id)` |
| Update | `resend.broadcasts.update(id, params)` | `resend.Broadcasts.update(params)` |
| Delete | `resend.broadcasts.remove(id)` | `resend.Broadcasts.remove(id)` |

## Create Parameters

**Required:** `name`, `from`, `subject`, `segmentId`, and one of `html` / `text` / `react`

**Optional:** `topicId`, `previewText`, `replyTo`, `send` (boolean), `scheduledAt`

## Lifecycle: Create then Send

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

// Step 1: Create a draft broadcast
const { data: broadcast, error: createError } = await resend.broadcasts.create({
  name: 'March Newsletter',
  from: 'Acme <news@acme.com>',
  subject: 'Hi {{{FIRST_NAME|there}}}, here is your March update',
  html: '<p>Hi {{{FIRST_NAME|there}}}</p><a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>',
  segmentId: 'seg_abc123',
  topicId: 'top_xyz789',     // optional: controls topic-level unsubscribes
});

if (createError) {
  console.error(createError);
  return;
}

// Step 2: Send it (or schedule)
const { data: sent, error: sendError } = await resend.broadcasts.send(broadcast.id, {
  scheduledAt: 'in 1 hour',  // optional: ISO 8601 or natural language
});

if (sendError) {
  console.error(sendError);
  return;
}
```

### Shortcut: Create and Send in One Call

Pass `send: true` on create to skip the separate send call:

```typescript
const { data, error } = await resend.broadcasts.create({
  name: 'Flash Sale',
  from: 'Acme <deals@acme.com>',
  subject: 'Flash sale - 24 hours only',
  html: '<p>Shop now!</p>',
  segmentId: 'seg_abc123',
  send: true,
});
```

## Get, List, Update, Cancel, Delete

```typescript
// Get
const { data, error } = await resend.broadcasts.get('bc_abc123');

// List with pagination
const { data, error } = await resend.broadcasts.list({ limit: 10, offset: 0 });

// Update a draft
const { data, error } = await resend.broadcasts.update('bc_abc123', {
  subject: 'Updated subject line',
});

// Cancel a queued or scheduled broadcast — stops a queued send mid-flight, or
// reverts a scheduled one to draft. Does not remove the broadcast.
const { data, error } = await resend.broadcasts.cancel('bc_abc123');

// Delete — draft or scheduled only (deleting a scheduled broadcast also
// cancels its delivery). Sent broadcasts cannot be deleted.
const { data, error } = await resend.broadcasts.remove('bc_abc123');
```

## Python Example

```python
import resend

resend.api_key = "re_xxxxxxxxx"

broadcast = resend.Broadcasts.create({
    "name": "March Newsletter",
    "from": "Acme <news@acme.com>",
    "subject": "Your March update",
    "html": "<p>Hello!</p>",
    "segment_id": "seg_abc123",
})

resend.Broadcasts.send({"broadcast_id": broadcast["id"]})
```

## Contact Property Interpolation

Use triple-mustache with a pipe for fallbacks: `{{{PROPERTY_KEY|fallback}}}`

```html
<p>Hi {{{FIRST_NAME|there}}}, your balance is {{{BALANCE|0}}}.</p>
<a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a>
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Expecting `create` to send the broadcast | `create` makes a draft. Call `send` separately, or pass `send: true` |
| Calling `.delete()` instead of `.remove()` | Node.js SDK uses `.remove()` for all delete operations |
| Deleting a sent broadcast | Only draft or scheduled broadcasts can be deleted |
| Cancelling a draft or sent broadcast | Only queued or scheduled broadcasts can be cancelled |
| Using `.remove()` when you just want to stop delivery | `.cancel()` stops/reverts without deleting the broadcast; `.remove()` deletes it entirely |
| Missing `segmentId` | Required — broadcasts target segments, not all contacts |
| Missing unsubscribe link | Include `{{{RESEND_UNSUBSCRIBE_URL}}}` in HTML |
| `{{VAR}}` instead of `{{{VAR}}}` | Triple braces required for variable interpolation |
| Ignoring `error` return | Node.js SDK returns `{ data, error }` — always check `error` |
| `scheduledAt` format confusion | Accepts both ISO 8601 (`2025-03-15T10:00:00Z`) and natural language (`in 1 hour`) |
