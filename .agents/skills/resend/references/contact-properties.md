# Contact Properties

Define custom properties that can be set on contacts and interpolated in broadcast HTML. Properties are account-wide — they apply across all segments.

## SDK Methods

| Operation | Node.js | Python |
|-----------|---------|--------|
| Create | `resend.contactProperties.create(params)` | `resend.ContactProperties.create(params)` |
| Get | `resend.contactProperties.get(id)` | `resend.ContactProperties.get(id)` |
| List | `resend.contactProperties.list(params?)` | `resend.ContactProperties.list()` |
| Update | `resend.contactProperties.update(params)` | `resend.ContactProperties.update(params)` |
| Delete | `resend.contactProperties.remove(id)` | `resend.ContactProperties.remove(id)` |

## Create Parameters

**Required:** `key`, `type`

**Optional:** `fallbackValue`

- `type`: `"string"` or `"number"` — **immutable** after creation
- `key`: alphanumeric + underscores, max 50 chars — **immutable** after creation
- `fallbackValue`: used when a contact lacks a value for this property (must match `type`)

## Node.js Example

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

// Create a property
const { data, error } = await resend.contactProperties.create({
  key: 'company_name',
  type: 'string',
  fallbackValue: 'your company',
});

if (error) {
  console.error(error);
  return;
}

// Get, list, update, delete
const { data: prop } = await resend.contactProperties.get(data.id);

const { data: props } = await resend.contactProperties.list();

// Only fallbackValue can be updated
const { data: updated } = await resend.contactProperties.update({
  id: data.id,
  fallbackValue: 'your organization',
});

const { data: deleted } = await resend.contactProperties.remove(data.id);
```

## Python Example

```python
import resend

resend.api_key = "re_xxxxxxxxx"

prop = resend.ContactProperties.create({
    "key": "company_name",
    "type": "string",
    "fallback_value": "your company",
})

# Only fallback_value can be updated
resend.ContactProperties.update({
    "id": prop["id"],
    "fallback_value": "your organization",
})
```

## Setting Properties on Contacts

Pass a `properties` object when creating or updating contacts:

```typescript
const { data, error } = await resend.contacts.create({
  email: 'alice@example.com',
  properties: {
    company_name: 'Acme Corp',
    plan_tier: 'enterprise',
  },
});
```

## Using in Broadcast HTML

Use triple-mustache syntax with a pipe for fallbacks:

```html
<p>Hi {{{FIRST_NAME|there}}}, welcome from {{{company_name|your company}}}!</p>
```

The fallback after the pipe overrides the property-level `fallbackValue` for that specific broadcast.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Trying to change `key` or `type` after creation | Both are immutable — delete and recreate if wrong |
| Updating fields other than `fallbackValue` | Only `fallbackValue` can be updated via the API |
| `fallbackValue` type mismatch | Must match the property `type` (string value for string property, number for number) |
| `{{VAR}}` instead of `{{{VAR}}}` in broadcast HTML | Triple braces required |
| Special characters in key | Only alphanumeric characters and underscores allowed |
| Calling `.delete()` instead of `.remove()` | Node.js SDK uses `.remove()` for all delete operations |
| Ignoring `error` return | Node.js SDK returns `{ data, error }` — always check `error` |
