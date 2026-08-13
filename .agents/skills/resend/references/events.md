# Events

## Overview

Events are named signals that can trigger automations and track contact activity. Define an event with an optional schema, then send it to associate it with a contact. Events are the primary way to start automation workflows.

## SDK Methods

### Node.js

| Operation | Method | Notes |
|-----------|--------|-------|
| Create | `resend.events.create(params)` | Define a new event with optional schema |
| Get | `resend.events.get(identifier)` | By ID (UUID) or event name |
| List | `resend.events.list(params?)` | Cursor-paginated |
| Update | `resend.events.update(params)` | Only `schema` can be updated |
| Delete | `resend.events.remove(identifier)` | By ID or event name |
| Send | `resend.events.send(params)` | Fire an event for a contact |

### Python

`resend.Events.create/get/list/update/remove/send` — same operations with snake_case params.

## Event Schema

Events can have an optional schema — a flat key/type map that defines the expected payload structure.

Supported types: `string`, `number`, `boolean`, `date`

```typescript
const { data, error } = await resend.events.create({
  name: 'order.completed',
  schema: {
    order_id: 'string',
    total: 'number',
    is_first_order: 'boolean',
    completed_at: 'date',
  },
});
```

```python
event = resend.Events.create({
    "name": "order.completed",
    "schema": {
        "order_id": "string",
        "total": "number",
        "is_first_order": "boolean",
        "completed_at": "date",
    },
})
```

Schema is optional — events without a schema accept any payload.

## Sending Events

Send an event to associate it with a contact. Provide either `contactId` (Node.js) / `contact_id` (Python) or `email` — exactly one, mutually exclusive.

```typescript
const { data, error } = await resend.events.send({
  event: 'order.completed',
  contactId: 'contact_abc123',
  payload: {
    order_id: 'ord_789',
    total: 99.99,
    is_first_order: true,
    completed_at: '2026-04-10T12:00:00Z',
  },
});
```

```python
resend.Events.send({
    "event": "order.completed",
    "email": "customer@example.com",  # or "contact_id": "contact_abc123"
    "payload": {
        "order_id": "ord_789",
        "total": 99.99,
        "is_first_order": True,
        "completed_at": "2026-04-10T12:00:00Z",
    },
})
```

Returns `202 Accepted` — the event is processed asynchronously.

## Update and Delete

Only the `schema` field can be updated. Set to `null` to clear it. Get, update, and delete all accept either the event ID (UUID) or event name as `identifier`.

```typescript
// Update schema
const { data, error } = await resend.events.update({
  identifier: 'order.completed',
  schema: { order_id: 'string', total: 'number' },
});

// Clear schema
const { data, error } = await resend.events.update({
  identifier: 'order.completed',
  schema: null,
});

// Delete by name
const { data, error } = await resend.events.remove('order.completed');
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Event name starting with `resend:` | The `resend:` prefix is reserved for system events |
| Providing both `contactId`/`contact_id` and `email` on send | Provide exactly one — not both |
| Providing neither `contactId`/`contact_id` nor `email` on send | Exactly one is required to associate the event with a contact |
| Expecting synchronous response from send | Send returns `202 Accepted` — processing is async |
| Trying to update the event name | Only `schema` can be updated — delete and recreate for name changes |
| Schema type mismatch in payload | Payload values should match the schema types (`string`, `number`, `boolean`, `date`) |
| Not checking `error` in Node.js | SDK returns `{ data, error }`, does not throw — always destructure and check |
