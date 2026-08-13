# Segments

Group contacts for broadcast targeting. Segments replaced legacy "audiences" — use `segmentId` not `audienceId` everywhere.

## SDK Methods

### Node.js

| Operation | Method |
|-----------|--------|
| Create | `resend.segments.create(params)` |
| Get | `resend.segments.get(id)` |
| List | `resend.segments.list(params?)` |
| Delete | `resend.segments.remove(id)` — not `.delete()` |

No update endpoint — delete and recreate to rename a segment.

### Python

| Operation | Method |
|-----------|--------|
| Create | `resend.Segments.create(params)` |
| Get | `resend.Segments.get(id)` |
| List | `resend.Segments.list(params?)` |
| Delete | `resend.Segments.remove(id)` |

## Create Segment

```typescript
const { data, error } = await resend.segments.create({
  name: 'Active Users',
});

if (error) {
  console.error(error);
  return;
}

console.log(data.id); // seg_xxxxxxxx
```

## Managing Contacts in Segments

Add or remove contacts from segments via the contacts sub-resource:

```typescript
// Add contact to segment
await resend.contacts.segments.add({ contactId: 'cont_xxx', segmentId: 'seg_xxx' });

// Remove contact from segment
await resend.contacts.segments.remove({ contactId: 'cont_xxx', segmentId: 'seg_xxx' });
```

Contacts can belong to multiple segments simultaneously.

## Using Segments with Broadcasts

Pass `segmentId` when creating a broadcast to target only contacts in that segment:

```typescript
await resend.broadcasts.create({
  name: 'Product Update',
  segmentId: 'seg_xxx',
  from: 'updates@acme.com',
  subject: 'Product Update',
  html: '<p>New features!</p>',
});
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `audienceId` | Audiences are deprecated — use `segmentId` |
| Calling `.update()` | No update endpoint — `.remove()` then `.create()` to rename |
| Calling `.delete()` | SDK method is `.remove()` |
| Expecting contacts auto-added | Contacts must be explicitly added via `contacts.segments.add()` |
