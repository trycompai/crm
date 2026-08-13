# Resend Templates

## Overview

Templates are reusable email structures stored on Resend. Define HTML and variables once; reference the template ID or alias when sending.

**Use templates when:** the same structure is reused across many sends, non-engineers need to edit copy without touching code, or you want version history.

**Use inline `html` when:** the structure changes per send, you need more than 50 dynamic variables, or you want tighter rendering control.

## Template Lifecycle

```
Create (draft) → Publish → Send
      ↑ edit                 |
      └─────────────────────┘
```

Editing a published template creates a new draft — the published version keeps sending until you publish again.

| State | Can send? |
|-------|-----------|
| **Draft** | No |
| **Published** | Yes |

## Variable Syntax

Use **triple mustache** in HTML and subject: `{{{VARIABLE_NAME}}}`

```html
<!-- ✅ Correct -->
<p>Hi {{{CUSTOMER_NAME}}}, your order #{{{ORDER_ID}}} has shipped!</p>

<!-- ❌ Wrong — double braces don't render in Resend -->
<p>Hi {{CUSTOMER_NAME}}</p>
```

Plain substitution only — no `{{#each}}`, `{{#if}}`, or other Handlebars control flow. Pre-render dynamic lists server-side into a single HTML variable.

Variable key casing is arbitrary (`ORDER_ID`, `orderId`, `order_id` all work) but must be consistent: whatever casing you use in the template definition must match exactly in the send call.

### Variable Definition

```typescript
{ key: 'ORDER_TOTAL', type: 'number', fallbackValue: 0 }
{ key: 'CUSTOMER_NAME', type: 'string', fallbackValue: 'Customer' }
{ key: 'ORDER_ID', type: 'string' }  // no fallbackValue = required at send time
```

- Variable **with** `fallbackValue` and missing at send → uses fallback, send succeeds
- Variable **without** `fallbackValue` and missing at send → send **fails** (422)

### Variable Constraints

| Constraint | Limit |
|------------|-------|
| Max variables per template | 50 |
| Key characters | ASCII letters, numbers, underscores only |
| Key max length | 50 characters |
| String value max | 2,000 characters |
| Number value max | 2^53 − 1 |

### Reserved Names

`FIRST_NAME` · `LAST_NAME` · `EMAIL` · `UNSUBSCRIBE_URL` · `RESEND_UNSUBSCRIBE_URL` · `contact` · `this`

These cannot be used as custom variable keys — rename to `USER_FIRST_NAME`, `USER_EMAIL`, etc.

## Sending with a Template

```typescript
const { data, error } = await resend.emails.send(
  {
    from: 'Acme <orders@acme.com>',
    to: ['customer@example.com'],
    template: {
      id: 'order-confirmation',  // alias or auto-generated ID
      variables: { CUSTOMER_NAME: 'Alice', ORDER_ID: '12345' },
    },
  },
  { idempotencyKey: `order-confirm/${orderId}` }
);
```

Cannot combine `template` with `html`, `text`, or `react` — mutually exclusive. `subject` and `from` from the template can be overridden per-send.

## Aliases

An alias is a stable, human-readable slug you set at create time. Pass it in the `id` field anywhere you'd use the auto-generated template ID.

```typescript
// Set alias at create time
await resend.templates.create({
  name: 'Order Confirmation',   // display-only
  alias: 'order-confirmation',  // referenceable slug
  html: '<p>Hi {{{CUSTOMER_NAME}}}</p>',
});

// Reference by alias — no need to store the generated tmpl_ ID
template: { id: 'order-confirmation', variables: { CUSTOMER_NAME: 'Alice' } }
```

## SDK Methods (Node.js)

| Operation | Method |
|-----------|--------|
| Create | `resend.templates.create(params)` |
| Get | `resend.templates.get(id)` |
| List | `resend.templates.list(params)` |
| Update | `resend.templates.update(id, params)` |
| Delete | `resend.templates.remove(id)` ← not `.delete()` |
| Publish | `resend.templates.publish(id)` |
| Duplicate | `resend.templates.duplicate(id)` |

### Create Template

**Required:** `name`, `html` (or `react`)
**Optional:** `alias`, `from`, `subject`, `reply_to`, `text`, `react`, `variables`

```typescript
const { data, error } = await resend.templates.create({
  name: 'Order Confirmation',
  alias: 'order-confirmation',
  subject: 'Your Order #{{{ORDER_ID}}}',
  html: '<p>Hi {{{CUSTOMER_NAME}}}, your order #{{{ORDER_ID}}} has shipped!</p>',
  variables: [
    { key: 'CUSTOMER_NAME', type: 'string', fallbackValue: 'Customer' },
    { key: 'ORDER_ID', type: 'string' },
  ],
});
// Returns: { id: 'tmpl_abc123', object: 'template' }
```

### Chainable Create → Publish

```typescript
const { data, error } = await resend.templates.create({
  name: 'Welcome',
  html: '<p>Hi {{{NAME}}}</p>',
}).publish();
// Template is created AND published in one call
```

### Get, List, Update, Delete

```typescript
// Get by ID or alias
await resend.templates.get('tmpl_abc123');
await resend.templates.get('order-confirmation');  // by alias

// List — cursor-based pagination, max 100 per page
const { data } = await resend.templates.list({ limit: 100 });
// data.has_more === true → fetch next page
await resend.templates.list({ limit: 100, after: data.data[data.data.length - 1].id });

// Update (partial — only provided fields change)
await resend.templates.update('tmpl_abc123', { name: 'Order Confirmed' });

// Delete
await resend.templates.remove('tmpl_abc123');  // returns { deleted: true }
```

See `fetch-all-templates.mjs` for a complete pagination loop.

### Publish

```typescript
await resend.templates.publish('tmpl_abc123');
// Template is now live. Publishing is synchronous — no delay needed before sending.
```

### Duplicate

```typescript
const { data, error } = await resend.templates.duplicate('tmpl_abc123');
// Returns: { id: 'tmpl_new456', object: 'template' }

// Chainable — duplicate and publish in one call
const { data, error } = await resend.templates.duplicate('tmpl_abc123').publish();
```

Useful for creating variants (e.g., A/B testing subject lines) or bootstrapping new templates from an existing one.

## Version History

Every template maintains full version history. Reverting creates a new draft from a previous version without affecting the published version. Accessible via the Resend dashboard template editor.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| `{{VAR}}` instead of `{{{VAR}}}` | Triple braces required — double braces don't render variables |
| Sending with draft template | Call `.publish()` first — draft templates cannot send |
| Adding delay after create/publish | Publishing is synchronous — send failure has another cause |
| `{{#each}}` or `{{#if}}` in template HTML | No loop/conditional support — pre-render dynamic lists server-side |
| `html` + `template` in same send call | Mutually exclusive — remove `html` when using template |
| Using `FIRST_NAME`, `EMAIL` as variable keys | Reserved — rename to `USER_FIRST_NAME`, `USER_EMAIL` |
| Variable without fallback missing at send | Add `fallbackValue` or always provide the variable |
| Calling `.delete()` | SDK method is `.remove()` |
| Expecting alias = name | `alias` is a separate referenceable slug; `name` is display-only |
| 60+ variables | Max 50 — pre-render complex content as a single HTML variable |
| No idempotency key on sends | Template sends use the same endpoint — pass `idempotencyKey` |
