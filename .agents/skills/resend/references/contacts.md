# Contacts

## Overview

Contacts represent email recipients stored in Resend. They support custom properties, segment assignment, and topic subscriptions for managing audiences and preferences.

## SDK Methods

### Node.js

| Operation | Method | Notes |
|-----------|--------|-------|
| Create | `resend.contacts.create(params)` | Add a contact with properties, segments, topics |
| Get | `resend.contacts.get({ id })` or `resend.contacts.get({ email })` | Lookup by ID or email |
| List | `resend.contacts.list({ limit?, offset?, segmentId? })` | Filter by segment |
| Update | `resend.contacts.update(params)` | By `id` or `email` |
| Delete | `resend.contacts.remove({ id })` or `resend.contacts.remove({ email })` | Not `.delete()` |

### Python

`resend.Contacts.create/get/list/update/remove` — same operations with snake_case params (e.g., `first_name`, `last_name`, `segment_id`).

## Create Contact

```typescript
const { data, error } = await resend.contacts.create({
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  unsubscribed: false,
  properties: {
    plan: 'enterprise',
    company: 'Acme Corp',
    signupDate: '2026-01-15',
  },
  segments: [{ id: 'seg_abc123' }],
  topics: [
    { id: 'topic_product_updates', subscription: 'opt_in' },
    { id: 'topic_marketing', subscription: 'opt_out' },
  ],
});
if (error) {
  console.error(error);
  return;
}
console.log(data.id); // contact ID
```

```python
contact = resend.Contacts.create({
    "email": "alice@example.com",
    "first_name": "Alice",
    "last_name": "Smith",
    "unsubscribed": False,
    "properties": {
        "plan": "enterprise",
        "company": "Acme Corp",
    },
})

# Add to segment separately (Python SDK doesn't support segments/topics on create)
resend.Contacts.Segments.add({"contact_id": contact["id"], "segment_id": "seg_abc123"})
```

## Get and Update

```typescript
// Get by email (alternative: pass { id: 'contact_uuid' })
const { data, error } = await resend.contacts.get({ email: 'alice@example.com' });

// Update by email — change properties, set a property to null to delete it
const { data: updated, error: updateErr } = await resend.contacts.update({
  email: 'alice@example.com',
  firstName: 'Alicia',
  properties: {
    plan: 'pro',       // update existing property
    company: null,     // delete this property
  },
});
```

## Delete and List

```typescript
// Delete by ID or email — pick one
const { data, error } = await resend.contacts.remove({ email: 'alice@example.com' });

// List with segment filter
const { data: contacts, error: listErr } = await resend.contacts.list({
  segmentId: 'seg_abc123',
  limit: 50,
});
```

## Bulk Import from CSV

Import many contacts at once from a CSV file (`POST /contacts/imports`, `multipart/form-data`). Imports run **asynchronously**: `create` returns an import id immediately, then poll `get` until `status` is `completed` (or `failed`).

### SDK Methods (Node.js)

| Operation | Method | Notes |
|-----------|--------|-------|
| Create | `resend.contacts.imports.create({ file, columnMap?, onConflict?, segments?, topics? })` | `file` is a `Blob`/`File` (CSV). Returns `{ id }` |
| Get | `resend.contacts.imports.get(id)` | Status + counts. `id` is a positional string — not `{ id }` |
| List | `resend.contacts.imports.list({ limit?, after?, before?, status? })` | `status` filters by `queued` / `in_progress` / `completed` / `failed` |

```typescript
import { readFile } from 'node:fs/promises';

const file = new Blob([await readFile('contacts.csv')], { type: 'text/csv' });

const { data, error } = await resend.contacts.imports.create({
  file,
  // 'upsert' (default) updates existing contacts; 'skip' leaves them unchanged
  onConflict: 'upsert',
  segments: [{ id: 'seg_abc123' }],
});
if (error) {
  console.error(error);
  return;
}

// Imports are async — poll until processing finishes
const { data: imp } = await resend.contacts.imports.get(data.id);
console.log(imp.status, imp.counts);
// e.g. 'completed' { total: 1200, created: 800, updated: 300, skipped: 75, failed: 25 }

// List past imports, newest first; filter by status and paginate with after/before
const { data: imports } = await resend.contacts.imports.list({ status: 'completed', limit: 20 });
```

### CSV columns

Without `columnMap`, columns are matched by the lowercase names `email` (required), `first_name`, `last_name`, `unsubscribed` — **matching is case-sensitive**, so a CSV with `Email` / `First Name` headers returns `422 validation_error` ("CSV missing required email column"). Map non-standard headers explicitly:

```typescript
await resend.contacts.imports.create({
  file,
  columnMap: {
    email: 'Email',
    firstName: 'First Name',
    lastName: 'Last Name',
    properties: { plan: { column: 'Plan', type: 'string' } },
  },
});
```

> The SDK accepts camelCase (`firstName`, `lastName`); the raw `multipart/form-data` field is `column_map` with snake_case keys (`first_name`, `last_name`). `column_map`, `segments`, and `topics` are sent as JSON-encoded strings. Maximum file size is 100 MB.

Properties that aren't already defined on your contacts are created automatically when you map them in the import; no need to pre-register them.

### Raw HTTP

```bash
curl -X POST 'https://api.resend.com/contacts/imports' \
  -H 'Authorization: Bearer re_xxxxxxxxx' \
  -F 'file=@contacts.csv;type=text/csv' \
  -F 'column_map={"email":"Email","first_name":"First Name"}' \
  -F 'on_conflict=upsert'
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Passing both `id` and `email` to get/update/remove | Use one or the other — not both |
| Using `audienceId` (Node.js) | Segments replaced audiences — use `segmentId`. Python SDK still uses `audience_id` in create params |
| Calling `.delete()` | SDK method is `.remove()` |
| Expecting property deletion with empty string | Set property value to `null` to delete it |
| Not checking `error` in Node.js | SDK returns `{ data, error }`, does not throw — always destructure and check |
| Forgetting `email` is required on create | `email` is the only required field — all others are optional |
| CSV import returns 422 "missing required email column" | Column matching is case-sensitive lowercase (`email`, `first_name`, `last_name`) — pass `columnMap` for headers like `Email` / `First Name` |
| Calling `imports.get({ id })` | `imports.get(id)` takes a positional string, unlike `contacts.get({ id })` |
| Treating an import as synchronous | `create` returns an id immediately — poll `imports.get(id)` until `status` is `completed` |
