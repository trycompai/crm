---
description: Use when recording a fact — picking the right evidence kind for what you actually saw, and understanding why a claim was written, offered or held.
---

# Evidence

You never set a confidence. You report what you saw, and the ledger prices it.
Getting the `kind` right is therefore the whole job — it is the difference
between a fact landing on a record and a rep being asked a question.

## The kinds, and what each one means

**Primary — these can carry a fact on their own.** All of them are a source
identifying *this person*, not merely being consistent with them.

| Kind | Use it when |
| --- | --- |
| `profile.email-match` | The profile itself shows the address we hold. Decisive. |
| `linkedin.employer-and-name` | A LinkedIn profile where the employer matches *and* the name is consistent with the address. Both, or it is not this. |
| `crm.thread-reply` | They replied, from that address, on a thread we synced. Proof of identity. |
| `crm.signature-block` | Their own signature states it. The best source there is for a job title. |
| `github.account-identity` | The GitHub account's own `name` (or name plus company) matches. |
| `crm.meeting-attendance` | They accepted a calendar invite we have. |

**Supporting — true, but not enough alone.**

| Kind | Use it when |
| --- | --- |
| `web.cited-claim` | A page states it and you have the URL. |
| `search.cites-profile` | A search for them by name and employer returned this profile. |
| `handle.name-form` | The handle is a construction of their name. Weak: `github.com/lewis` is a form of every Lewis's name. |
| `employer-only` | The employer matches but the name does not. Nearly worthless on its own, and deliberately so — this is how a colleague gets filed as the contact. |

**`contradiction` — when two sources disagree.**

Record it. It does not lower the score a little; it holds the fact entirely,
which is correct. A profile saying one employer and a mail header saying another
is not 60% true, it is unresolved, and a rep should see it that way.

## What good evidence looks like

One entry per **independent** source. Two things on the same page are one
observation, not two: a GitHub profile whose name and company both match is one
`github.account-identity`, not a name match plus a company match. Splitting it
would double-count a single page into false certainty, which is exactly the
arithmetic this system exists to avoid.

`detail` is read by a rep in a tooltip. Write it for them:

- Good: `their signature on 14 July reads "Head of Security, Acme"`
- Bad: `signature match confirmed`

## What happens next, so you can stop guessing about it

The write path is `record_fact` / `identify_contact`. It scores evidence, then
applies `fillsBlank` — you do not choose the outcome.

- Below the floor (no band) → **not stored.** A miss stays a miss.
- Clears the floor and the field is blank (or a derived placeholder name) →
  **written**, any band that cleared the floor. Approving a sourced guess into
  an empty field is free for the rep; the system does that write.
- Clears the floor but a human or prior value already fills the field, and the
  band is not VERIFIED → **proposal** for a rep. Only VERIFIED replaces a filled
  field.
- A human-typed value always wins; dismissed values are never re-offered.

`employer-only` alone is deliberately below the floor. That is how a colleague
at the same company is kept off the record.

A proposal is a good outcome when the field already has a value. Do not hunt for
extra evidence to push a claim over a line — that is how a wrong answer gets
dressed up as a right one.
