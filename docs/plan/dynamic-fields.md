# Plan — Dynamic fields

Fields a workspace defines for itself, on companies, contacts and deals, edited
from one sheet that opens from any record.

The visual design is in Paper, file **CRM**, page **crm - lewis**, artboards
`Dynamic fields — cog placement`, `/companies?record=company:abcd&fields=company`,
`Dynamic fields — new field & empty` and `Dynamic fields — on the record`. This
document is the half Paper cannot hold: the model, the API and the agent.

This document is the design record — what we decided and why. The build order —
files, procedures, component mapping, phases — is
[`dynamic-fields-build.md`](./dynamic-fields-build.md), which points back here
for the schema in §3 rather than copying it.

Read it with [`AGENTS.md`](../../AGENTS.md), [`api.md`](../api.md) and
[`design.md`](../design.md).

---

## 1. One sheet, one cog

The cog goes in the **DETAILS section header**, on all three sheets. That is the
`action` slot `DetailSheetSection` already has, so no new primitive and no
per-sheet variation — the same element in the same place whether DETAILS is the
full width of the contact sheet or the 320px rail of the company sheet.

Not the header bar beside Re-enrich and Close: that bar is about *this record*,
and the cog is not. It changes every company at once.

Which is the one thing the sheet has to say out loud. It opens with **"This
shapes every company in your CRM"**, because a control reached from Northwind
Labs' sheet will otherwise be read as belonging to Northwind Labs.

The sheet stacks over the record sheet at 460px, dimming it, and carries an
entity switcher — Companies / Contacts / Deals — so the same sheet reached from a
deal can still fix a contact field without closing anything.

State lives in the URL beside `record`, in `record-stack.ts`:

```
/companies?record=company:abcd&fields=company
```

so it is shareable, Escape and Back close it in the right order, and the record
underneath survives a refresh.

## 2. Standard fields are in the list

The sheet shows two groups: **Standard** (Name, Domain, Website, Phone, Email,
City, Country, Owner) and **Custom fields**. Standard fields are real rows — they
can be reordered and hidden, never deleted or retyped. A rep who opens the sheet
looking for "Domain" finds it and learns the rule in the same second, which is
cheaper than any explanation of why it is missing.

Custom fields then render **inline in DETAILS**, in the order set here. No
"Custom fields" box. A field is a field; the grouping was an implementation
detail and does not belong on the record.

## 3. The model

```prisma
enum FieldEntity { COMPANY CONTACT DEAL }

enum FieldType {
  TEXT LONG_TEXT NUMBER DATE CHECKBOX SELECT URL EMAIL PHONE USER
}

model FieldDefinition {
  id     String      @id @default(cuid())
  entity FieldEntity
  key    String
  label  String
  type   FieldType

  agentFilled Boolean @default(true)
  agentBrief  String?

  required    Boolean @default(false)
  showOnSheet Boolean @default(true)
  showOnTable Boolean @default(false)
  position    Int

  archivedAt DateTime?

  options FieldOption[]
  values  FieldValue[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([entity, key])
  @@index([entity, position])
  @@map("fieldDefinition")
}

model FieldOption {
  id       String          @id @default(cuid())
  fieldId  String
  field    FieldDefinition @relation(fields: [fieldId], references: [id], onDelete: Cascade)
  label    String
  position Int

  archivedAt DateTime?
  values     FieldValue[]

  @@index([fieldId, position])
  @@map("fieldOption")
}

model FieldValue {
  id      String          @id @default(cuid())
  fieldId String
  field   FieldDefinition @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  companyId String?
  company   Company? @relation(fields: [companyId], references: [id], onDelete: Cascade)
  contactId String?
  contact   Contact? @relation(fields: [contactId], references: [id], onDelete: Cascade)
  dealId    String?
  deal      Deal?    @relation(fields: [dealId], references: [id], onDelete: Cascade)

  text     String?
  number   Decimal?     @db.Decimal(24, 4)
  date     DateTime?
  bool     Boolean?
  optionId String?
  option   FieldOption? @relation(fields: [optionId], references: [id], onDelete: SetNull)
  userId   String?
  user     User?        @relation("FieldValueUser", fields: [userId], references: [id], onDelete: SetNull)

  updatedAt DateTime @updatedAt

  @@unique([fieldId, companyId])
  @@unique([fieldId, contactId])
  @@unique([fieldId, dealId])
  @@index([fieldId, text])
  @@index([fieldId, number])
  @@index([fieldId, date])
  @@index([companyId])
  @@index([contactId])
  @@index([dealId])
  @@index([optionId])
  @@index([userId])
  @@map("fieldValue")
}
```

`User` carries the other half of that relation:

```prisma
fieldValues FieldValue[] @relation("FieldValueUser")
```

Six decisions worth defending:

- **Typed columns, not a `Json` value.** `api.md` says filter, sort and paginate
  in Prisma. A JSON blob cannot be indexed or ordered honestly, and the moment
  someone wants the pipeline sorted by *Renewal date* the answer would be to pull
  the table into the browser. One column per storage class keeps that promise;
  the type on the definition says which one is live.
- **One value table with three nullable FKs, not three tables.** Every FK
  cascades, so deleting a company takes its values with it. `AgentTask` carries
  `contactId`/`companyId` with no FK and `api.md` documents the chore that
  creates — "clear `AgentTask` and `AgentEvent` yourself". Not repeating it.
- **Options are rows.** Renaming "Google Cloud" must not orphan every record
  pointing at it, and a JSON array of strings makes rename indistinguishable from
  delete-plus-create.
- **`key` is immutable, `label` is not.** The key is what the API and the agents
  say; the label is what the rep reads. Renaming the label of a field an agent
  has filled for a month cannot break the brief that taught it.
- **The record columns are indexed on their own, not only inside the uniques.**
  A record read is `where: { companyId }` with no `fieldId` —
  `FieldsService.valuesFor` opens every sheet that way — and a unique starting
  `fieldId` cannot serve it. The composite uniques stay for the one-value-per-
  field-per-record rule; the standalone indexes are what the reads use.
- **`userId` is a foreign key, like every other id on the row.** A `USER` field
  holds a workspace user, so a deleted rep must not leave an id on the record
  that resolves to nobody. `SetNull` matches `Company.owner` and
  `Contact.owner`: the value empties, and it never blocks the delete.

**Archive, not delete.** A record delete is hard in this CRM by design, but a
*definition* delete destroys a column of typed data across every record at once.
Archiving keeps the values and hides the field everywhere; a true delete stays
available behind a separate destructive confirm that names the count.

No `organizationId`, on any of the three. Single tenant.

## 4. The API

A new module, `apps/api/src/fields/`, one router as the codegen glob expects:

| Procedure | Notes |
| --- | --- |
| `fields.list({ entity, includeArchived })` | Definitions with options, in `position` order. |
| `fields.create` / `fields.update` | Key derived from label on create, rejected on update. |
| `fields.reorder({ entity, ids })` | One transaction, positions rewritten from the array. |
| `fields.archive` / `fields.restore` / `fields.delete` | Delete is the loud one. |

**Values do not get their own router.** They ride the record procedures that
already exist: `companies.byId` returns `fields`, `companies.update` accepts
`fields: Record<key, value>`. One write per record, one invalidation, and the
inline editors keep using the mutation they already use.

The value validator is derived from the definition at runtime — a shared
`crm/fields.ts` that both the router's zod schema and the service use, so a
`NUMBER` field cannot be written a string by either path.

`useCrmCache()` gains `cache.fields(entity)`. A definition change is a schema
change: it fans out to every list and record query for that entity. Rare enough
that the width does not matter, and `{ settle: "record" }` still covers the
inline value edits.

`src/generated/server.ts` is regenerated by `dev`/`check-types` and committed, or
the app cannot see any of this.

## 5. Agent-first, and what that costs

This was the open question, and the answer is **agent-first**: `agentFilled`
defaults to **true**. A new field is something your agents keep up to date unless
you say otherwise, and "Manual only" is the exception a rep opts into.

That is a real difference, not a default flipped for effect. It changes three
things:

- **Order in the editor.** The brief — *What counts as an answer* — sits directly
  under the label, **above** the type. The second thing you write is the
  instruction, not the shape.
- **What the list shows.** Each row's subtitle is its brief, truncated. Agent
  upkeep is the unmarked normal case; only the exceptions read "Manual only".
  Nothing is badged for doing the expected thing.
- **What an empty brief means.** Not "never touched" — that was the old,
  opt-in reading. Agents work from the label and the type alone; the brief
  sharpens what would count. Opting out is `agentFilled: false`, one switch.

**Never "eve" in the product.** UI copy says *your agents*. `eve` is the runtime
in `apps/agent`, an implementation detail a rep should never have to learn, and
a self-hoster may well point this at their own. The word appears in this
document and in the code; it does not appear on screen.

Nest still writes rows and fills nothing. Creating or editing a definition with
`agentFilled` writes **one** `AgentTask` (`kind: "field-backfill"`, `reason` =
the key) — one row per field, not one per record. The agent leases it and decides
the fan-out, batching and priority itself, which is the point of the rule in
`api.md` and the reason a workspace with 5,000 companies does not get 5,000 rows
from one click.

`agentBrief` is the whole instruction, in the rep's words:

> Which cloud they run production on. Their docs, status page or engineering job
> ads say it outright — infer nothing from a logo on a customer wall.

The self-hoster's answer is unchanged and still needs no special case: with no
agent running, nothing leases the task, nothing proposes, and every field is one
you type into. A missing capability removes a capability. It does not throw.

**Proposed, not written** — and this is what makes agent-first safe to default
on. A value an agent finds arrives the way a `ContactFact` arrives: `PROPOSED`,
with a score, a band and evidence, rendered by the `Suggestion` component that
already exists, accepted or dismissed by a human. A dotted underline
(`SOURCED_VALUE`) then marks what an agent put there, and hover gives the source.
Nothing a rep typed is ever overwritten.

Turning this on by default would be reckless if agents wrote straight into the
field. They do not, so the cost of a wrong default is a suggestion someone
dismisses — against a rep never discovering the feature at all, which is the cost
of the opt-in version.

That behaviour is already built; the fork is that `ContactFact` is contact-only
and keys on `field String`.

Recommendation: **generalise `ContactFact` to `RecordFact`** with the same three
nullable FKs and an optional `fieldId`, rather than growing a parallel proposal
table for custom fields. It is the larger migration and the smaller system. This
is the one decision in this plan that should be made before any of it is built,
because it is the only one that gets more expensive later — and agent-first makes
it load-bearing rather than optional.

## 6. What the UI needs that does not exist

Everything in the design is already in `packages/ui` — Sheet, Input, Select,
Switch, Checkbox, Button, Suggestion, the Inline\* editors — with one exception.

**There is no drag-and-drop library in the repo.** The design shows a drag handle
on every row. Either:

1. add `@dnd-kit/core` + `@dnd-kit/sortable` to `packages/ui` and build a
   `SortableList` there, which is where a shared interaction belongs; or
2. ship reordering as Move up / Move down in the row's overflow menu, and add
   dragging later.

Option 2 is a smaller first cut and the ordering it produces is identical. Option
1 is what the artboards show. Worth deciding explicitly rather than by accident.

## 7. Deliberately out of scope

- **Filtering and sorting the tables by a custom field.** The columns exist
  (`showOnTable`), the indexes support it, `resolveOrderBy` would need to learn
  about field keys. Phase two.
- **Quick-add.** New fields do not appear in quick-add unless `required`.
- **Per-record fields.** A field belongs to an entity, never to one company.
- **Formula, rollup and relation types.** Not in the first cut.
