# Domains

## Overview

Domains must be verified before sending. The workflow is: create domain, add DNS records to your provider, call verify, then poll until verified.

```
Create → Add DNS records → Verify → Poll status → Send
```

## SDK Methods

### Node.js

| Operation | Method | Notes |
|-----------|--------|-------|
| Create | `resend.domains.create(params)` | Returns DNS records to configure |
| Get | `resend.domains.get(id)` | Returns domain with DNS records and status |
| List | `resend.domains.list({ limit?, offset? })` | Paginated list |
| Update | `resend.domains.update(params)` | Update tracking, TLS, capabilities |
| Delete | `resend.domains.remove(id)` | Permanent — not `.delete()` |
| Verify | `resend.domains.verify(id)` | Triggers async DNS verification |

### Python

`resend.Domains.create/get/list/update/remove/verify` — same operations with snake_case params (e.g., `custom_return_path`, `open_tracking`, `click_tracking`).

> **Claiming a domain another Resend account already verified?** See [Claim a Domain](#claim-a-domain) — available in the Node.js, Python, Ruby, Go, Rust, and Java SDKs, and the CLI (`resend domains claim`).

## Use a Subdomain

Prefer a subdomain (e.g., `send.example.com`) over the root domain:

- **No MX conflicts** with existing email (Google Workspace, Microsoft 365)
- **Isolated reputation** — if transactional reputation gets damaged, your root domain is unaffected
- DNS records (DKIM CNAMEs, MX, TXT) go on the **subdomain**, not the root

## Create Domain

```typescript
const { data, error } = await resend.domains.create({
  name: 'send.acme.com',           // subdomain recommended
  region: 'us-east-1',              // immutable after creation
  customReturnPath: 'bounce',       // optional: bounce@send.acme.com — helps DMARC alignment
  openTracking: false,
  clickTracking: false,
});
if (error) {
  console.error(error);
  return;
}

// data.records contains DNS records to add:
// [{ type: 'MX', name: '...', value: '...' }, { type: 'TXT', ... }, ...]
console.log(data.id);      // domain ID for later calls
console.log(data.records);  // add these to your DNS provider
```

```python
domain = resend.Domains.create({
    "name": "send.acme.com",
    "region": "us-east-1",
    "custom_return_path": "bounce",
    "open_tracking": False,
    "click_tracking": False,
})
# domain["records"] has the DNS entries to configure
```

## Verify Flow

After adding DNS records to your provider, trigger verification and poll:

```typescript
// Trigger verification (returns immediately)
await resend.domains.verify(data.id);

// Poll until verified (DNS propagation can take minutes to hours)
const { data: domain } = await resend.domains.get(data.id);
console.log(domain.status); // 'pending', 'verified', 'failed'
```

### Verify DNS Propagation

```bash
dig TXT send.example.com +short
dig MX send.example.com +short
dig CNAME resend._domainkey.send.example.com +short
```

## Update Domain

```typescript
const { data, error } = await resend.domains.update({
  id: 'domain_abc123',
  clickTracking: true,
  openTracking: true,
  tls: 'enforced',
  capabilities: { sending: 'enabled', receiving: 'enabled' },
});
```

## Claim a Domain

Claiming takes over a domain **another Resend account has already verified**. The domain transfers to your account as a **brand-new domain with fresh DKIM keys**, so the previous account's DNS records can't be reused — you must update DNS and verify before sending or receiving.

```
Claim → Add TXT proof to DNS → Verify claim → (completed) → Update DKIM in DNS → Verify domain → Send
```

Claim methods are available in the **Node.js** (`resend >= 6.14.0`), **Python** (`resend >= 2.34.0`), **Ruby** (`resend >= 1.6.0`), **Go** (`resend-go/v3 >= 3.11.0`), **Rust** (`resend-rs >= 0.26.1`), and **Java** (`resend-java >= 4.16.0`) SDKs, plus the **CLI** (`resend domains claim`) and REST API. Not yet in the PHP or .NET SDKs.

| Operation | Method | Notes |
|-----------|--------|-------|
| Start claim | `resend.domains.claims.create({ name })` | Accepts `name` (required) + optional `region`, `customReturnPath`, `openTracking`, `clickTracking`, `trackingSubdomain` (`domains.create` body minus `tls`/`capabilities`). Returns a `domain_claim` with `domain_id` + the TXT `record` to add |
| Get claim | `resend.domains.claims.get(domainId)` | Latest claim for the placeholder domain — poll `status` |
| Verify claim | `resend.domains.claims.verify(domainId)` | Triggers async DNS proof + transfer (not synchronous) |

Method naming per SDK: Python `resend.Domains.Claims.create/get/verify` (async: `create_async/get_async/verify_async`), Ruby `Resend::Domains::Claims.create/get/verify`, Go `client.DomainClaims.Create(&CreateDomainClaimRequest{...})/Get(domainId)/Verify(domainId)` (+ `*WithContext`), Rust `domains.claim(opts)/get_claim(id)/verify_claim(id)`, Java `resend.domains().claims().create(ClaimDomainOptions)/get(id)/verify(id)`.

```typescript
// 1. Start the claim — returns the placeholder domain id + TXT record to add
const { data: claim, error } = await resend.domains.claims.create({
  name: 'send.acme.com',
});
if (error) {
  console.error(error);
  return;
}
console.log(claim.domain_id); // placeholder domain id for later calls
console.log(claim.record);    // { type: 'TXT', name, value, ttl } — add to DNS

// 2. After adding the TXT record, trigger verification
await resend.domains.claims.verify(claim.domain_id);

// 3. Poll until the claim status is 'completed'
const { data: latest } = await resend.domains.claims.get(claim.domain_id);
console.log(latest.status); // 'pending' | 'verified' | 'completed' | 'blocked' | ...

// 4. Once 'completed', the transferred domain has NEW DKIM records:
//    fetch them, update your DNS, then verify the domain itself.
const { data: domain } = await resend.domains.get(claim.domain_id);
console.log(domain.records); // add these to DNS, then:
await resend.domains.verify(claim.domain_id);
```

```python
# 1. Start the claim — returns the placeholder domain id + TXT record to add
claim = resend.Domains.Claims.create({"name": "send.acme.com"})
print(claim["domain_id"])  # placeholder domain id for later calls
print(claim["record"])     # {type: 'TXT', name, value, ttl} — add to DNS

# 2. After adding the TXT record, trigger verification
resend.Domains.Claims.verify(domain_id=claim["domain_id"])

# 3. Poll until the claim status is 'completed'
latest = resend.Domains.Claims.get(domain_id=claim["domain_id"])
print(latest["status"])  # 'pending' | 'verified' | 'completed' | 'blocked' | ...

# 4. Once 'completed', fetch the transferred domain's NEW DKIM records,
#    update DNS, then verify the domain itself.
domain = resend.Domains.get(claim["domain_id"])
print(domain["records"])  # add these to DNS, then:
resend.Domains.verify(claim["domain_id"])
```

A `blocked` status means a safety check failed — inspect `blocked_reason` (`grace_period`, `recent_owner_activity`, `pending_scheduled_emails`).

## Parameter Reference

| Parameter | Values | Default | Notes |
|-----------|--------|---------|-------|
| `region` | `us-east-1`, `eu-west-1`, `sa-east-1`, `ap-northeast-1` | `us-east-1` | **Immutable** after creation |
| `customReturnPath` | string (e.g., `"bounce"`) | none | Results in `bounce@example.com` — helps DMARC alignment |
| `tls` | `opportunistic`, `enforced` | `opportunistic` | |
| `openTracking` | `true`, `false` | Domain default | |
| `clickTracking` | `true`, `false` | Domain default | |
| `capabilities` | `{ sending: 'enabled'\|'disabled', receiving: 'enabled'\|'disabled' }` | sending enabled | |
| `trackingSubdomain` / `tracking_subdomain` | string | none | Subdomain for click/open tracking URLs (e.g., `"track"` → `track.example.com`). Set on create or update |

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using root domain when a subdomain would be safer | Consider `send.example.com` — avoids MX conflicts with existing email and isolates reputation |
| Sending before DNS records are added | Create returns DNS records — add them to your provider first, then verify |
| Expecting `verify()` to be synchronous | Verify triggers async check — poll with `get()` to confirm status |
| Trying to change `region` after creation | Region is **immutable** — delete and recreate the domain |
| MX record value doesn't match region | MX must be region-specific (`feedback-smtp.{region}.amazonses.com`) — use the exact records from the create response |
| Cloudflare proxy mode enabled | Disable proxy (orange → gray cloud) for all Resend DNS records — CNAME proxy breaks DKIM verification |
| DNS provider auto-appends domain name | GoDaddy/Namecheap may turn `resend._domainkey.send.acme.com` into `resend._domainkey.send.acme.com.acme.com` — add a trailing dot or enter just the subdomain portion |
| DNS records added to root instead of subdomain | DKIM CNAMEs go on `resend._domainkey.send.example.com`, not `resend._domainkey.example.com` |
| Calling `.delete()` | SDK method is `.remove()` |
| Deleting a domain accidentally | Delete is permanent with no undo — verify intent before calling |
| Using `enforced` TLS with recipients that don't support it | Use `opportunistic` (default) unless you know all recipients support TLS |
| Not checking `error` in Node.js | SDK returns `{ data, error }`, does not throw — always destructure and check |
| Forgetting region on create | Defaults to `us-east-1` — set explicitly for EU/SA/AP data residency requirements |
| Reusing the old account's DNS records after a claim | A claim issues **new DKIM keys** — fetch the transferred domain with `domains.get()`, update DNS, then `domains.verify()` |
| Treating the claim as done at `completed` | `completed` only means the transfer finished — the domain still needs its new DKIM records in DNS and a `domains.verify()` to send |
| Expecting `claims.verify()` to be synchronous | It triggers an async DNS proof + transfer — poll `claims.get()` for `status` |
| Looking for a claim method in PHP or .NET | Claims are in the Node.js, Python, Ruby, Go, Rust, and Java SDKs (plus CLI and REST API) — PHP/.NET don't support them yet |
