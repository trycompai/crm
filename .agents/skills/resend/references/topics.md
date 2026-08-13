# Topics

Fine-grained subscription preferences — contacts opt in or out per topic. Topics control which contacts receive broadcasts when `topicId` is set.

## SDK Methods

### Node.js

| Operation | Method |
|-----------|--------|
| Create | `resend.topics.create(params)` |
| Get | `resend.topics.get(id)` |
| List | `resend.topics.list()` — no pagination params |
| Update | `resend.topics.update(params)` |
| Delete | `resend.topics.remove(id)` — not `.delete()` |

### Python

| Operation | Method |
|-----------|--------|
| Create | `resend.Topics.create(params)` |
| Get | `resend.Topics.get(id)` |
| List | `resend.Topics.list()` |
| Update | `resend.Topics.update(params)` |
| Delete | `resend.Topics.remove(id)` |

## Create Topic

```typescript
const { data, error } = await resend.topics.create({
  name: 'Product Updates',
  defaultSubscription: 'opt_in',  // REQUIRED: "opt_in" or "opt_out"
  description: 'New features and releases',
  visibility: 'public',  // "public" or "private" (default: "private")
});

if (error) {
  console.error(error);
  return;
}

console.log(data.id); // topic_xxxxxxxx
```

## Update Topic

`defaultSubscription` is **immutable** after creation. Only `name`, `description`, and `visibility` can be updated.

```typescript
const { data, error } = await resend.topics.update({
  id: 'topic_xxx',
  name: 'Product News',
  visibility: 'public',
});
```

## Managing Contact Subscriptions

Update a contact's topic subscriptions via the contacts sub-resource:

```typescript
await resend.contacts.topics.update({
  id: 'cont_xxx',
  topics: [
    { id: 'topic_xxx', subscription: 'opt_in' },
    { id: 'topic_yyy', subscription: 'opt_out' },
  ],
});
```

## Using Topics with Broadcasts

Pass `topicId` when creating a broadcast — only contacts subscribed to that topic receive it:

```typescript
await resend.broadcasts.create({
  name: 'Feature Launch',
  segmentId: 'seg_xxx',
  topicId: 'topic_xxx',
  from: 'updates@acme.com',
  subject: 'New Feature Launch',
  html: '<p>Check it out!</p>',
});
```

## Constraints

| Constraint | Limit |
|------------|-------|
| Name max length | 50 characters |
| Description max length | 200 characters |
| `defaultSubscription` | `"opt_in"` or `"opt_out"` — immutable after create |
| `visibility` | `"public"` (shown on preference page) or `"private"` (default) |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Omitting `defaultSubscription` on create | Required — must be `"opt_in"` or `"opt_out"` |
| Trying to change `defaultSubscription` | Immutable after creation — delete and recreate with new value |
| Calling `.delete()` | SDK method is `.remove()` |
| `visibility: "hidden"` | Not a valid value — use `"private"` |
| Expecting `list()` to accept pagination | `topics.list()` takes no params — returns all topics |
| Broadcast without `topicId` | Goes to all contacts in segment regardless of topic preferences |
