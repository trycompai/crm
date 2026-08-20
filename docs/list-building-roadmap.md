# List-Building Roadmap

A plan to answer the Director of Sales Development's read on the CRM: filtering
looks thin for real BDR list-building. Integrations are out of scope, by his own
note — this is about fields, filters, and views inside the CRM itself.

## 1. What he saw

> "As it stands it looks like a research/automation layer more than a system of
> record — I'd be concerned about moving off HubSpot/Salesforce-caliber
> filtering without seeing those gaps closed first."
>
> — Director of Sales Development, first-look feedback

He is right about the current state. Today's filtering is this small:

- **3** Company filters — owner, industry, enrichment
- **2** Contact filters — owner, company
- **1** value per filter — no "is any of" yet
- **0** saved or shared list views

## 2. Why this is cheaper than it looks

Two systems already in the CRM cover most of the fields on his list. Neither is
exposed as a filter yet — that is the actual gap, not missing intelligence.

**Already built — admin fields.** An admin-configurable field system already
backs every record sheet and table: `FieldDefinition` + `FieldOption` +
`FieldValue`, with a `SELECT` type for picklists and a `USER` type for a second
owner. Account type, segment/tier, territory, lifecycle stage, and lead source
all fit this today — no database migration required.

**Already built — agent inference.** The agent already scores `seniority` and
`function` (persona) per contact from evidence, the same pipeline that fills
title and LinkedIn today. It just isn't wired to a column, so it never reaches
the table or a filter.

## 3. The gap map

Every field from his note, what backs it today, and the plan to close it.

### Companies view

All seven rows below are already seeded as `FieldDefinition` rows
(`seedCompanyFields` in `packages/db/prisma/seed.ts`) with real option sets. The
gap is not the field — it is that none of them show on the table or reach the
filter bar yet.

| Field he wants | Where it stands today | Plan | Effort |
| --- | --- | --- | --- |
| Account type (prospect / customer / partner / churned) | Seeded `SELECT` field — Prospect, Customer, Partner, Churned | Turn on table + filter | Small |
| Inside Sales / BDR owner (separate from AE / account owner) | Seeded `USER` field, sits beside Owner | Turn on table + filter | Small |
| Segment / tier | Seeded `SELECT` field — Enterprise, Mid-Market, SMB | Turn on table + filter | Small |
| ICP fit score | Seeded `NUMBER` field; agent scoring is a natural next step, not a v1 requirement | Turn on table + filter | Small |
| Territory | Seeded `SELECT` field — AMER, EMEA, APAC | Turn on table + filter | Small |
| Lifecycle stage | Seeded `SELECT` field — Lead, MQL, SQL, Opportunity, Customer, … | Turn on table + filter | Small |
| Lead source (IB / OB / Event) | Seeded `SELECT` field — Inbound, Outbound, Event, kept separate from the `source` enum that records how a row entered the CRM | Turn on table + filter | Small |

### Contacts view

| Field he wants | Where it stands today | Plan | Effort |
| --- | --- | --- | --- |
| Title filter | Column exists, shown on the table, no filter | Add it as a filter | Small |
| Seniority | The agent already infers and scores this per contact — never synced anywhere filterable | Sync into a real column the same way title already syncs; then filter on it | Medium |
| Persona | Agent infers this as "function" — same situation as seniority | Same fix as seniority, same pipeline | Medium |
| Engagement / activity recency | Last-activity date is tracked and shown, not filterable | Add an "active within 7 / 30 / 90 days" filter | Medium |
| Sequence status | No source of truth — this CRM does not run sequences | Needs an outreach-tool connection. Deferred, per your note to set integrations aside. | Deferred |

## 4. The part that actually blocks list-building

Adding every field above still will not give a BDR a HubSpot-style
list-builder. The filter bar itself is one value at a time. This is the real
foundation, and it comes before the fields above pay off.

1. **Filters are single-select** *(Medium)* — a BDR cannot say "VP or Director"
   or "SF Bay Area or NYC" in one filter today — each filter holds exactly one
   value.
2. **Admin fields are not filterable at all** *(Medium)* — every custom
   field — present or future — shows up as a column only. None of it reaches
   the filter bar without new plumbing.
3. **No saved or shared views** *(Large)* — a working list a BDR builds today
   lives only in the URL. There is no way to name it, save it, or hand it to a
   teammate.

## 5. Sequence

Four phases, in order — each phase's fields are inert without the phase before
it.

### Phase 1 — Filter engine foundation *(ships first)*

Multi-select ("is any of") on every filter. Any admin-defined `SELECT` or
`USER` field becomes a filter automatically. An activity-recency filter goes in
here too.

Resolves: unlocks every field below · engagement / activity recency

### Phase 2 — Company segmentation fields

Turn on table and filter visibility for the seven Company fields from the gap
map — account type, BDR owner, segment/tier, territory, lifecycle stage, lead
source, ICP fit score. All seven are already seeded; nothing new to create.

Resolves: account type · BDR owner · segment/tier · territory · lifecycle
stage · lead source · ICP fit score

### Phase 3 — Contact intelligence, surfaced

Sync the agent's existing seniority and persona facts into real, filterable
fields. Add the title filter.

Resolves: seniority · persona · title filter

### Phase 4 — Saved & shared views *(later, on request)*

Name a filter combination, save it, share it with the team. Sequence status
waits here too, tied to an outreach-tool connection if that scope reopens.

Resolves: reusable BDR lists · sequence status (needs an integration)

## 6. Issues

Reported in full, including risks this plan does not remove.

1. RISK — New fields alone do not fix list-building. Filters stay single-select
   without phase 1.
   Fix: build multi-select filtering first. Sequence, above, already orders
   this first.
2. NOT DONE — Custom fields are not wired into any filter today. They render as
   table columns only.
   Fix: not done. Planned in phase 1 as automatic facet generation.
3. NOT DONE — Sequence status has no source of truth inside this CRM.
   Fix: not done. Needs an outreach-tool integration — out of scope now, per
   your note.
4. RISK — A BDR owner shipped as an admin field will not appear in
   owner-based reports until someone decides it should.
   Fix: ship as an admin field first. Promote to a first-class column only if
   reporting needs it later.
5. UNKNOWN — No user role distinguishes an AE from a BDR today, so no field
   can default itself by role.
   Fix: not investigated. Confirm before phase 2 whether role-based defaults
   matter to him.

---

Scoped to the CRM's own data model and filter UI. Integrations, per your note,
are out of scope for this plan.
