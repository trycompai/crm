# Automations

## Overview

Automations are event-driven workflows composed of steps connected in a directed graph. Each automation has a trigger step that starts the flow, followed by action steps (send email, delay, wait for event, condition, contact update, contact delete, add to segment).

Automations are created in a `disabled` state by default. Set `status: "enabled"` to activate.

## SDK Methods

### Node.js

| Operation | Method | Notes |
|-----------|--------|-------|
| Create | `resend.automations.create(params)` | Returns automation ID |
| Get | `resend.automations.get(id)` | Returns full automation with steps and connections |
| List | `resend.automations.list(params?)` | Filter by `status`, cursor-paginated |
| Update | `resend.automations.update(params)` | Partial update — name, status, or steps+connections |
| Delete | `resend.automations.remove(id)` | Permanent |
| Stop | `resend.automations.stop(id)` | Sets status to `disabled` |
| List Runs | `resend.automations.runs.list({ automationId, status? })` | Filter by run status |
| Get Run | `resend.automations.runs.get({ automationId, runId })` | Returns run with executed steps |

### Python

`resend.Automations.create/get/list/update/remove/stop` — same operations with snake_case params.

## Graph Model

An automation is a directed graph of **steps** connected by **connections**.

### Steps

Each step has a `key` (unique within the graph), a `type`, and a `config` object whose shape depends on the type.

| Type | Config | Description |
|------|--------|-------------|
| `trigger` | `{ event_name: string }` | Entry point — fires when the named event occurs |
| `send_email` | `{ template: { id: string, variables?: object }, subject?: string, from?: string, reply_to?: string }` | Sends an email using a published template |
| `delay` | `{ duration: string }` | Pauses the run. `duration` is human-readable (e.g. `"30 minutes"`, `"3 days"`) |
| `wait_for_event` | `{ event_name: string, timeout?: string, filter_rule?: object }` | Waits for an event. `timeout` is human-readable (e.g. `"1 hour"`). `filter_rule` uses the same rule tree as `condition` but restricted to `event.*` fields |
| `condition` | Rule tree (see below) | Branches based on contact data |
| `contact_update` | `{ first_name?, last_name?, unsubscribed?, properties? }` | Updates the contact |
| `contact_delete` | `{}` | Deletes the contact |
| `add_to_segment` | `{ segment_id: string }` | Adds the contact to a segment |

### Rule Tree (condition & filter_rule)

Leaf nodes: `{ "type": "rule", "field": "<namespace>.<key>", "operator": "<op>", "value": "<val>" }`

Groups: `{ "type": "and" | "or", "rules": [...] }` for nesting.

Supported operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `contains`, `starts_with`, `ends_with`, `exists`, `is_empty`. The `exists` and `is_empty` operators require no `value`.

For `condition` steps, fields use the `contact.*`, `event.*`, or `wait_events.*` namespaces (e.g. `contact.properties.plan`). For `filter_rule` in `wait_for_event`, fields use `event.*` or `contact.*` (e.g. `event.status`).

### Connections

Connections link steps by their `key`. Each connection has a `type`:

| Connection Type | Use |
|-----------------|-----|
| `default` | Normal flow between steps |
| `condition_met` | Branch when condition is true |
| `condition_not_met` | Branch when condition is false |
| `timeout` | Branch when `wait_for_event` times out |
| `event_received` | Branch when `wait_for_event` receives the event |

## Examples

### Create an Automation

```typescript
const { data, error } = await resend.automations.create({
  name: 'Welcome Series',
  status: 'enabled',
  steps: [
    {
      key: 'trigger_signup',
      type: 'trigger',
      config: { event_name: 'user.signed_up' },
    },
    {
      key: 'send_welcome',
      type: 'send_email',
      config: {
        template: { id: 'tmpl_abc123' },
        from: 'Acme <hello@acme.com>',
        subject: 'Welcome to Acme!',
      },
    },
    {
      key: 'wait_3_days',
      type: 'delay',
      config: { duration: '3 days' },
    },
    {
      key: 'send_followup',
      type: 'send_email',
      config: {
        template: { id: 'tmpl_def456' },
        from: 'Acme <hello@acme.com>',
        subject: 'Getting started with Acme',
      },
    },
  ],
  connections: [
    { from: 'trigger_signup', to: 'send_welcome' },
    { from: 'send_welcome', to: 'wait_3_days' },
    { from: 'wait_3_days', to: 'send_followup' },
  ],
});
```

```python
automation = resend.Automations.create({
    "name": "Welcome Series",
    "status": "enabled",
    "steps": [
        {"key": "trigger_signup", "type": "trigger", "config": {"event_name": "user.signed_up"}},
        {"key": "send_welcome", "type": "send_email", "config": {
            "template": {"id": "tmpl_abc123"},
            "from": "Acme <hello@acme.com>",
            "subject": "Welcome to Acme!",
        }},
        {"key": "wait_3_days", "type": "delay", "config": {"duration": "3 days"}},
        {"key": "send_followup", "type": "send_email", "config": {
            "template": {"id": "tmpl_def456"},
            "from": "Acme <hello@acme.com>",
            "subject": "Getting started with Acme",
        }},
    ],
    "connections": [
        {"from": "trigger_signup", "to": "send_welcome"},
        {"from": "send_welcome", "to": "wait_3_days"},
        {"from": "wait_3_days", "to": "send_followup"},
    ],
})
```

### Conditional Branching

```typescript
const { data, error } = await resend.automations.create({
  name: 'Onboarding with condition',
  status: 'enabled',
  steps: [
    { key: 'trigger', type: 'trigger', config: { event_name: 'user.signed_up' } },
    {
      key: 'check_plan',
      type: 'condition',
      config: { type: 'rule', field: 'contact.properties.plan', operator: 'eq', value: 'pro' },
    },
    { key: 'send_pro', type: 'send_email', config: { template: { id: 'tmpl_pro' }, from: 'Acme <hello@acme.com>' } },
    { key: 'send_free', type: 'send_email', config: { template: { id: 'tmpl_free' }, from: 'Acme <hello@acme.com>' } },
  ],
  connections: [
    { from: 'trigger', to: 'check_plan' },
    { from: 'check_plan', to: 'send_pro', type: 'condition_met' },
    { from: 'check_plan', to: 'send_free', type: 'condition_not_met' },
  ],
});
```

### Update an Automation

When updating the workflow graph, both `steps` and `connections` must be provided together. You can update `name` or `status` independently.

```typescript
// Enable/disable without changing the graph
const { data, error } = await resend.automations.update({
  id: 'aut_abc123',
  status: 'disabled',
});
```

```typescript
// Update the full graph (steps + connections required together)
const { data, error } = await resend.automations.update({
  id: 'aut_abc123',
  steps: [/* full step array */],
  connections: [/* full connections array */],
});
```

### List and Monitor Runs

```typescript
// List runs, optionally filter by status
const { data: runs } = await resend.automations.runs.list({
  automationId: 'aut_abc123',
  status: 'running,failed',  // comma-separated: running, completed, failed, cancelled
});

// Get a specific run with executed step details
const { data: run } = await resend.automations.runs.get({
  automationId: 'aut_abc123',
  runId: 'run_def456',
});
// run.steps[].status, run.steps[].output, run.steps[].error
```

### Stop an Automation

```typescript
const { data, error } = await resend.automations.stop('aut_abc123');
// data.status === 'disabled'
```

## Constraints

- Max **150 steps** per automation
- At least **one trigger step** required
- Steps and connections must be provided **together** when updating the graph
- `key` must be unique within the automation
- Connections reference steps by `key`

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Creating without a trigger step | Every automation needs at least one step with `type: "trigger"` |
| Updating steps without connections (or vice versa) | When changing the graph, provide both `steps` and `connections` together |
| Using `ref` or `edges` (old naming) | Use `key` for step identifiers and `connections` for links between steps |
| Using `template_id` in send_email config | Use `template: { id: "..." }` — template is a nested object |
| Using `seconds` in delay config (old naming) | Use `duration` (e.g. `"30 minutes"`) — `seconds` is no longer accepted |
| Forgetting to enable the automation | Automations default to `disabled` — set `status: "enabled"` on create or update |
| Not checking `error` in Node.js | SDK returns `{ data, error }`, does not throw — always destructure and check |
