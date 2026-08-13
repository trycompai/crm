# API Keys

Create, list, and delete API keys programmatically. No get or update endpoints exist.

## SDK Methods

| Operation | Node.js | Python |
|-----------|---------|--------|
| Create | `resend.apiKeys.create(params)` | `resend.ApiKeys.create(params)` |
| List | `resend.apiKeys.list(params?)` | `resend.ApiKeys.list()` |
| Delete | `resend.apiKeys.remove(id)` | `resend.ApiKeys.remove(id)` |

## Create Parameters

**Required:** `name`

**Optional:** `permission`, `domainId`

- `permission`: `"full_access"` (default) or `"sending_access"`
- `domainId`: only applies when `permission` is `"sending_access"` — scopes the key to a single domain
- `name`: max 50 characters

## Examples

### Node.js

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

// Create a domain-scoped sending key
const { data, error } = await resend.apiKeys.create({
  name: 'Production Sending Key',
  permission: 'sending_access',
  domainId: 'd_abc123',
});

if (error) {
  console.error(error);
  return;
}

// IMPORTANT: This is the only time the token is returned -- store it now
console.log('API Key:', data.token);  // re_xxxxxxxxx
console.log('Key ID:', data.id);

// List all keys (tokens are NOT included in list response)
const { data: keys, error: listError } = await resend.apiKeys.list();

// Delete a key
const { data: deleted, error: deleteError } = await resend.apiKeys.remove('api_key_id');
```

### Python

```python
import resend

resend.api_key = "re_xxxxxxxxx"

# Create a domain-scoped sending key
key = resend.ApiKeys.create({
    "name": "Production Sending Key",
    "permission": "sending_access",
    "domain_id": "d_abc123",
})

# IMPORTANT: Store the token immediately
print(f"API Key: {key['token']}")

# List all keys
keys = resend.ApiKeys.list()

# Delete a key
resend.ApiKeys.remove("api_key_id")
```

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not storing the token on create | The token is returned **once** — store it immediately |
| Expecting a get or update endpoint | Neither exists — list returns metadata only (no tokens) |
| Setting `domainId` with `full_access` | `domainId` only applies to `sending_access` keys |
| Calling `.delete()` instead of `.remove()` | Node.js SDK uses `.remove()` for all delete operations |
| Ignoring `error` return | Node.js SDK returns `{ data, error }` — always check `error` |
| Name over 50 characters | `name` has a 50-character limit |

## Response Fields

List returns metadata for each key:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | API key ID |
| `name` | string | Display name |
| `created_at` | string | Creation timestamp |
| `last_used_at` | string \| null | Last time the key was used (null if never used) |
