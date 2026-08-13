---
description: Use when creating or editing a marketing segment — every facet that exists, the shape of the filter tree, and the order to call the tools in.
---

# Building a segment

A segment is one saved question about contacts. The same compiler answers it for
the count, the blast, the entry sweep, the exit sweep and a branch, so there is
one shape and no second way to write it.

## The order to work in

1. `list_segments` — the answer often already exists. Reuse beats a near
   duplicate.
2. `read_segment` when the rep has one open. **The id in your session preamble
   is the segment they are looking at. Pass it to `write_segment` as
   `segmentId`.** Leaving it out creates a second segment and leaves the rep
   staring at the old one.
3. `preview_segment` with the definition you intend to save. Say the count out
   loud before you save.
4. `write_segment`. It refuses a tree it cannot read and hands the problems
   back. Fix them and call it again.

## The shape

A filter tree of four node types. Nothing else parses.

```json
{ "all": [
  { "facet": { "facet": "tracking.visitedPath", "path": "/pricing", "atLeast": 2 } },
  { "not": { "facet": { "facet": "meeting.bookedWithin", "days": 30 } } },
  { "facet": { "facet": "deal.hasNoOpen" } }
] }
```

- `{ "all": [...] }` — every child matches. Up to 50 children.
- `{ "any": [...] }` — one child matches.
- `{ "not": {...} }` — one child, inverted.
- `{ "facet": {...} }` — a leaf. The `facet` key holds the name.

The outermost value must be one of those four. A bare facet object without the
`facet` wrapper is the mistake to avoid.

## Every facet

**The person**

| Facet | Fields |
| --- | --- |
| `contact.hasEmail` | — |
| `contact.owner` | `userId` |
| `contact.source` | `source` |
| `contact.titleContains` | `value` |
| `contact.createdWithin` | `days` |

**Their company**

| Facet | Fields |
| --- | --- |
| `company.industry` | `value` |
| `company.country` | `value` |
| `company.domainIn` | `domains` (1–500) |

**A custom field**

| Facet | Fields |
| --- | --- |
| `field.equals` | `key`, `value` |

**What happened**

| Facet | Fields |
| --- | --- |
| `activity.within` | `days` |
| `activity.notWithin` | `days` |
| `mailbox.repliedWithin` | `days` |
| `mailbox.neverReplied` | — |
| `meeting.bookedWithin` | `days` |
| `meeting.notBookedWithin` | `days` |

**The pipeline**

| Facet | Fields |
| --- | --- |
| `deal.atStage` | `stage` |
| `deal.hasNoOpen` | — |
| `deal.closedWonWithin` | `days` |

**The website**

| Facet | Fields |
| --- | --- |
| `tracking.visitedPath` | `path`, `atLeast` (default 1) |
| `tracking.submittedForm` | `path` |

**Marketing itself**

| Facet | Fields |
| --- | --- |
| `marketing.openedCampaign` | `campaignId` |
| `marketing.clickedCampaign` | `campaignId` |
| `marketing.inCampaign` | `campaignId` |
| `marketing.noSendWithin` | `days` |

`days` is a whole number from 0 to 3650. Text fields hold 1 to 200 characters.

## Rules that hold

- **Always add `contact.hasEmail`** unless the rep asked for a count of people
  rather than an audience. A contact with no address is queued and skipped.
- **`marketing.openedCampaign` is a weak fact.** Apple Mail opens every message
  before a person does. Prefer a click, a reply or a page visit.
- **Rules and hands live on the same segment.** Somebody added by hand stays in
  even when the rules stop matching them. You write rules; you do not add
  people.
- **Editing rules changes who enters next.** It never pulls somebody out of a
  drip they are already walking. Say so when a rep asks you to tighten a live
  one.
- **A segment is not consent.** Somebody who read a page did not ask to hear
  from you. Say it when the segment is purely behavioural.
