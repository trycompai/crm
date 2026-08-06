# Plan — Dynamic fields (build)

Build instructions for the agent implementing dynamic fields on companies,
contacts and deals.

[`dynamic-fields.md`](./dynamic-fields.md) is the **design record** — it owns the
schema and the reasoning behind every decision. This document is the **build
order**: what to type, where, and in what sequence. Where they disagree, the
design doc wins on *why* and this one wins on *how*.

Two constraints govern everything below.

1. **The Paper design is fixed.** Match it exactly. Do not improve it, round it,
   or reword it.
2. **shadcn components only.** No hand-rolled buttons, inputs, switches, chips or
   menus. If a component does not exist, add it to `packages/ui` with the shadcn
   CLI or add a variant there — never at the call site.

---

## 0. Read before you type, and say what you read

| Before touching | Read |
| --- | --- |
| Anything | [`AGENTS.md`](../../AGENTS.md), [`design.md`](../design.md), [`dynamic-fields.md`](./dynamic-fields.md) |
| `apps/api` | [`api.md`](../api.md), `.agents/skills/nestjs-trpc/SKILL.md` |
| `packages/db` | `.agents/skills/prisma-database-setup/SKILL.md` |
| `apps/app` | `apps/app/AGENTS.md` → then the relevant guide in `apps/app/node_modules/next/dist/docs/01-app/` |
| URL state | `.agents/skills/nuqs/SKILL.md` |
| Any UI | `.agents/skills/shadcn/SKILL.md` and `rules/styling.md`, `rules/composition.md`, `rules/forms.md` |
| `apps/agent` | `.agents/skills/eve/SKILL.md` → then `apps/agent/node_modules/eve/docs/README.md` |
| A telemetry event | [`telemetry.md`](../telemetry.md) |

## 1. The design

Paper file **CRM**, page **crm - lewis**:
`https://app.paper.design/file/01KZ72S23CM00WXN6S1MP68M03/5-1`

| Artboard | What it specifies |
| --- | --- |
| `/companies?record=company:abcd` | Cog in the DETAILS header; custom fields inline; a pending agent suggestion |
| `/contacts?record=contact:abcd` | Cog placement only |
| `/deals?record=deal:abcd` | Cog placement only |
| `…&fields=company` | The fields sheet — list state |
| `…&fields=company (first run)` | Empty state |
| `…&fields=company&field=new` | Create a field |
| `…&fields=company&field=runs_on` | Edit a field, with coverage |
| `…&fields=company&field=runs_on (archive)` | Archive confirmation |

**Take values from the file, not from screenshots.** `get_jsx`,
`get_computed_styles`, `get_node_info`. A screenshot will not tell you whether a
gap is 8 or 10.

Every user-visible string is in §7. They are final.

## 2. Schema

Copy the Prisma models from **[`dynamic-fields.md` §3](./dynamic-fields.md)**
verbatim — `FieldEntity`, `FieldType`, `FieldDefinition`, `FieldOption`,
`FieldValue`. That section also explains why values are typed columns rather than
JSON, why one value table carries three nullable FKs, and why `key` is immutable.
Do not redesign it; if you think it is wrong, say so before writing the
migration.

On top of that:

- Migration name: `dynamic_fields`. Run through `bun run db:migrate` in
  `packages/db` — never `db:push` for a schema that ships.
- Add the back-relations on `Company`, `Contact` and `Deal`
  (`fieldValues FieldValue[]`).
- `agentFilled Boolean @default(true)` — the default is the feature. See
  [`dynamic-fields.md` §5](./dynamic-fields.md).
- No `organizationId`. Single tenant.

## 3. `@crm/db/fields` — the shared core

Everything else in this plan is a caller of this module. It is what makes the
feature API-driven *and* agent-driven without two implementations drifting apart.

Create `packages/db/src/fields.ts` and add `"./fields": "./src/fields.ts"` to the
`exports` map in `packages/db/package.json` — the same shape as
`@crm/db/currency` and `@crm/db/workspace`, which are the precedents.

It owns:

- `FIELD_TYPES` and the type→storage-column map (`TEXT`→`text`, `NUMBER`→
  `number`, `DATE`→`date`, `CHECKBOX`→`bool`, `SELECT`→`optionId`, `USER`→
  `userId`, …).
- `fieldKeyFromLabel(label)` — slug, collision-checked by the caller against
  `@@unique([entity, key])`.
- `valueSchemaFor(definition)` — returns the Zod schema for one field's value.
- `readValues(entity, recordId)` / `writeValues(tx, entity, recordId, values)` —
  the only two functions that touch `FieldValue`.
- `serializeField(definition)` — the wire shape used by tRPC *and* by agent
  tools, so both see identical field metadata.

**Rule: no field logic anywhere else.** Not in a router, not in a service, not in
a component, not in an eve tool. A validator written twice is a bug with a
delay on it.

## 4. API — `apps/api/src/fields/`

Four files, mirroring `apps/api/src/companies/`:
`fields.contracts.ts`, `fields.router.ts`, `fields.service.ts`, `fields.module.ts`.
Register `FieldsModule` in `app.module.ts` imports; `FieldsRouter` **must** be in
the module's `providers` or it silently does not exist at runtime.

`@Router({ alias: "fields" })` + `@UseMiddlewares(AuthMiddleware)` on the class.
No middleware means public — there is no other guard.

| Procedure | Input | Notes |
| --- | --- | --- |
| `fields.list` | `{ entity, includeArchived? }` | Definitions with options, `position` order |
| `fields.byKey` | `{ entity, key }` | For the editor screen |
| `fields.create` | label, type, options, `agentFilled`, `agentBrief`, placement | Key derived from label |
| `fields.update` | id + same, minus key | Reject a `key` change with `BAD_REQUEST` |
| `fields.reorder` | `{ entity, ids }` | One transaction, positions rewritten from the array |
| `fields.archive` / `fields.restore` | `{ id }` | Archive is the normal path |
| `fields.delete` | `{ id }` | Loud, and separate from archive |
| `fields.backfill` | `{ id }` | Writes **one** `AgentTask`, `kind: "field-backfill"` — never one per record |

Rules that are not optional:

- **Routers are thin.** Zod in, service call out. Prisma lives in the service.
- **Values do not get their own router.** They ride the record procedures:
  `companies.byId` gains `fields`, `companies.update` accepts
  `fields: Record<key, value>`. Same for contacts and deals. One write, one
  invalidation, and the existing inline editors keep their mutation.
- Services throw Nest's `HttpException` family; `DomainErrorMiddleware` maps them.
- **Regenerate and commit** `src/generated/server.ts` (`bun run trpc:generate`).
  If the app cannot see `trpc.fields.*`, this is why.
- Tests: `apps/api/test/fields.spec.ts`, `bun:test`, modelled on
  `apps/api/test/bulk.spec.ts` (real database, `TEST_RUN_ID`-suffixed data,
  cleaned up in `afterAll`). Cover: key collision, key immutability, value
  coercion per type, archive keeps values, delete cascades, reorder is atomic.

## 5. Agents — `apps/agent`

The API is one caller of `@crm/db/fields`; the agent is the other. Add
`apps/agent/agent/lib/fields.ts` as a thin wrapper, in the shape of
`lib/facts.ts`, then these tools in `apps/agent/agent/tools/`:

| Tool | Does |
| --- | --- |
| `list_fields` | Every field for an entity with its key, type, options and brief — so the agent can discover the schema instead of being told it |
| `set_field_value` | Write a value the agent is certain of |
| `propose_field_value` | Offer a value with evidence — routes through the fact/proposal path, not a direct write |
| `create_field` / `update_field` | Manage definitions, so "add a field for X" works in chat |
| `archive_field` | Behind `lib/approval.ts`. Destructive schema changes get a human |

Constraints:

- The `agentBrief` is the instruction the agent works from. `list_fields` must
  return it.
- Tool descriptions carry the same voice as the existing tools — read
  `record_fact.ts` and `search_crm.ts` first.
- **Nest still writes rows, not intelligence.** `fields.backfill` writes an
  `AgentTask`; the agent decides fan-out, batching and priority.
- Missing capability ⇒ missing capability, never a throw.

**MCP later, for free.** Every capability is a tRPC procedure over
`@crm/db/fields`, and every tool is a thin call to the same module. An MCP server
is then a mechanical wrapper over `fields.*` with no new logic. That only stays
true if you keep logic out of the tools. Do not build MCP now.

## 6. App — `apps/app`

### URL state (nuqs)

Two params, added to the **existing shared parser object** in
`apps/app/components/crm/record-sheet/record-stack.ts` — do not start a second
parser file:

```ts
fields: parseAsStringLiteral(RECORD_KINDS),
field: parseAsString,
```

- `fields` is the entity whose fields are open; `field` is either the create
  sentinel `new` or a field key. Add nothing else to the pasted lines — AGENTS.md
  forbids code comments, and these go straight into `record-stack.ts`.
- **`new` is a reserved key**, held back by `RESERVED_KEYS` in
  `packages/db/src/fields-shape.ts`, so a field labelled *New* slugs to
  `new_field` and its editor can still be opened. Never let the sentinel and a
  derivable key collide.
- Both cleared by the existing `write()` alongside `tab`, `add`, `thread`.
- `useQueryStates` for the pair; `null` to clear; `history: "replace"` for sheet
  state, matching what `record-stack.ts` already does.
- The cog sets `fields` to the record's own kind, so the sheet opens on the
  entity you came from.

### Components — use these, build nothing

| Element in Paper | Use |
| --- | --- |
| Fields sheet shell | `DetailSheet` (`components/detail-sheet.tsx`) at a new `md` size |
| Sheet header, back + title + close | `DetailSheetHeader` — it already does back-at-left, close-at-right |
| Entity switcher | `Tabs` / `TabsList` / `TabsTrigger`, default variant |
| Standard / Archived disclosure rows | `Collapsible` — **add it**: `bunx --bun shadcn@latest add collapsible` in `packages/ui` |
| Type chip (`Select`, `Date`, `Number`, `Checkbox`) | `Badge` — **add it**, then add a `mono` variant in `packages/ui` |
| Row overflow menu | `Button variant="ghost" size="icon-xs"` + `DropdownMenu` |
| Drag handle | `Button variant="ghost" size="icon-xs"` carrying the dnd listeners, Carbon `Draggable` icon |
| Form labels and helper text | `Field`, `FieldLabel`, `FieldDescription`, `FieldGroup` (`packages/ui/src/components/field.tsx`) |
| Label / brief inputs | `Input`, `Textarea` |
| Type picker | `Select` |
| Option rows | `InputGroup` with a leading handle addon and a trailing remove `Button` |
| "Add option" | `Button variant="ghost" size="sm"` |
| Agent toggle | `Switch` |
| Placement toggles | `Checkbox` + `FieldLabel` |
| Footer actions | `Button` (primary) and `Button variant="outline"` |
| Coverage block | Mirror `DetailSheetPending`'s muted panel; dot is `StatusIndicator` |
| Archive confirm | `AlertDialog`, action button destructive |
| Empty state | `Empty` / `EmptyHeader` / `EmptyMedia` / `EmptyTitle` / `EmptyDescription` / `EmptyContent` |
| The cog itself | `Button variant="ghost" size="icon-sm"`, Carbon `Settings`, in `DetailSheetSection`'s existing `action` slot |

Three additions to `packages/ui`, because that is where they belong:

1. **`md` sheet size.** `sheetContentVariants` has `sm | lg | xl | 2xl` and
   nothing near 460px. Add `md: "data-[side=left]:sm:max-w-[460px] data-[side=right]:sm:max-w-[460px]"`.
   The width comes from the artboards, and 1:1 outranks landing on a Tailwind step.
2. **`Badge` + a `mono` variant** for the type chip.
3. **`SortableList`** over `@dnd-kit/core` + `@dnd-kit/sortable`. The repo has no
   drag-and-drop library today. The artboards show drag handles on both field
   rows and option rows, so dragging is in scope and a Move up / Move down menu
   is *not* an acceptable substitute here.

`EmptyDescription` also has no wrap class — add `text-balance` there so the empty
state does not orphan its last word. Fix it in the component, not at the call
site.

### Rendering fields on a record

In `company-sheet.tsx` (then contacts, then deals), custom fields render **inline
inside the existing `Details` section**, after the standard properties, in
`position` order. No "Custom fields" heading, no separate section.

One map from `FieldType` to the editor that already exists:

| Type | Component |
| --- | --- |
| `TEXT`, `URL`, `EMAIL`, `PHONE` | `InlineField` (with `type`) |
| `LONG_TEXT` | `InlineTextArea` |
| `NUMBER` | `InlineField` |
| `DATE` | `InlineDateField` |
| `SELECT`, `USER` | `InlineSelectField` |
| `CHECKBOX` | `Checkbox` in a `DetailSheetProperty` |

Agent-sourced values get `SOURCED_VALUE` (dotted underline) with `SourcedValue`
for the hover source. Pending proposals render with the existing `Suggestion`
component. Both are built — use them, do not restyle them.

### Table columns

`showOnTable` is opt-in per field. A workspace with thirty fields must not get a
thirty-column table. Wire it into the existing column definitions in
`companies-table.tsx` and friends.

### Cache

Add `fields(entity?)` to `CrmCache` in `apps/app/lib/trpc/cache.ts`. A definition
change invalidates `fields.list` plus every list and record query for that
entity. Value edits keep `{ settle: "record" }` so the inline spinner clears
without waiting for the table. **A new mutation adds a call there, not a new list
of keys at the call site.**

## 7. Copy — verbatim

**Fields sheet**

- Title `Fields`
- Subtitle `This shapes every company in your CRM.` (company / contact / deal)
- Tabs `Companies` `Contacts` `Deals`
- `Standard fields` · `8 · reorder and hide only`
- `Custom fields` · `Drag to order`
- `Archived` · `2 · values kept, hidden everywhere`
- Footer `New field` · `Order here is the order on the sheet`

**Empty state**

- `No custom fields yet`
- `Create dynamic fields that your agents can research and pre-fill.`
- `New field`

**Editor**

- `Label`
- `Key` · `What the API and your agents call it. Set from the label, fixed once saved — renaming the label later never breaks a caller.`
- `Let your agents fill this` · `They propose a value with a source, and never overwrite yours.`
- `What counts as an answer` · `Leave it empty and your agents work from the label and type alone.`
- `Type` · `Select — one of a fixed list`
- `Options` · `Add option`
- `Show on the company sheet` · `Offer as a column on the Companies table`
- `Create field` · `Cancel` · `Save changes` · `Archive`

**Coverage**

- `Filled on 41 of 64 companies`
- `Last looked 2 days ago · you accepted 38 of 41`
- `Fill the rest`

**Archive dialog**

- `Archive Runs on?`
- `Hidden everywhere. Its 41 values are kept.`
- `Cancel` · `Archive field`

Never "eve" in the product. It is *your agents*.

## 8. Order of work

Each phase ends green — typecheck, lint, tests — before the next begins.

1. **Schema.** Models, migration, back-relations. `bun run db:migrate`.
2. **`@crm/db/fields`.** Types, key derivation, value schemas, read/write. Unit
   tests here; it is pure and cheap to test.
3. **API.** Contracts, service, router, module, registration. Regenerate and
   commit `server.ts`. `fields.spec.ts` green.
4. **Values on records.** `byId` returns `fields`, `update` accepts them, all
   three entities.
5. **`packages/ui` additions.** Sheet `md`, `Badge` + mono, `Collapsible`,
   `SortableList`, `EmptyDescription` balance.
6. **The sheet.** List → empty → create → edit → archive, in that order,
   checking each against its artboard before moving on.
7. **The cog and the record rendering.** Companies first, then contacts and
   deals.
8. **Table columns.**
9. **Agent lib and tools.**

## 9. Do not

- Do not deviate from the artboards, including the copy.
- Do not write a custom button, input, chip, switch or menu.
- Do not override component colours or typography with `className`. Layout only.
- Do not put field logic in a router, a component or a tool — it goes in
  `@crm/db/fields`.
- Do not put a vendor client, scoring or enrichment in `apps/api`.
- Do not add code comments.
- Do not add a `Co-Authored-By` trailer.
- Do not add a per-package `.env`.
- Do not hand-edit `apps/api/src/generated/server.ts` — regenerate it.
- Do not build the MCP server. Keep the seam clean so it stays a wrapper.
- Do not make the agent toggle default off.

## 10. Decisions already made — do not relitigate

- Agent-first: `agentFilled` defaults true, the brief sits above the type in the
  editor, and only manual fields are badged. [`dynamic-fields.md` §5](./dynamic-fields.md).
- Archive over delete for definitions, with delete kept as a separate loud action.
- Standard fields appear in the list, reorderable and hideable, never deletable.
- Custom fields render inline in DETAILS with no grouping of their own.

## 11. Open — decide with Lewis, do not guess

**Generalising `ContactFact` to `RecordFact`** (three nullable FKs plus an
optional `fieldId`) so agent proposals work for custom fields on all three
entities, instead of a parallel proposal table. `ContactFact` is contact-only and
keys on `field String`. Agent-first makes this load-bearing rather than optional,
and it is the one decision that gets more expensive after launch. Raise it before
phase 9 — earlier if phase 1 would touch it.
