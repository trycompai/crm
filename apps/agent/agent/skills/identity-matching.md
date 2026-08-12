---
name: identity-matching
description: How to decide that a LinkedIn profile is the person behind a CRM email address, and when to refuse.
---

# Identity matching

You are given an email address and a company. You need the person. Getting this
wrong writes a stranger's career onto a customer's record, so the procedure is
built to fail closed.

## Why the obvious approach does not work

`pmarchetti@fernhill.com` is not a name. Searching for it directly returns nothing.
Asking a model what it stands for produces "Paula Marchetti" — which happens to be
right, and would have been just as confident had it been wrong. You cannot tell
the difference afterwards, which is why guessing is banned outright.

What works is decomposition: `pmarchetti` contains the surname `marchetti`, and
searching *that* alongside the company returns `linkedin.com/in/paulamarchetti`
as the first result. The guess went into the **query**, and the answer came from
the profile.

That is the shape of every match: guess where to look, never what you will find.

LinkDAPI is an **enricher, not a finder**. It reads a known slug superbly and
must never be used to search people by name (that search returns strangers).
Finding the slug is Context web search (`site:linkedin.com/in`).

## The procedure

0. **`read_crm_history` first.** It is free and it is often decisive. If they
   have ever replied to us from that address, you already have the strongest
   evidence available anywhere — `crm.thread-reply` — and a signature block may
   hand you their title as well. Start every match here, not at a search engine.
1. **`resolve_linkedin_profile`** with the email and company. It decomposes the
   local part, runs Context `site:linkedin.com/in` search, and returns candidate
   slugs. These are leads, not answers. An empty list is a finished answer.
2. **`get_linkedin_profile`** on each candidate, passing the email, company name
   and domain — **and the `contactId`**. It returns the profile, a code verdict,
   and a ready **`evidence` array**. Passing the id is what lets it copy their
   photograph, which it does only if the verdict comes back positive, in code,
   without asking you. Leaving it out costs the contact their picture and saves
   nothing.
3. **Read the verdict, not the profile.** It checks two things:
   - `employerMatches` — a current position matches the company we have.
   - `nameMatches` — the real name is consistent with the email local part
     (`y` + `okonkwo` → Tomi Okonkwo).
4. **Both, or it is not them.** One of the two is not a weaker match, it is a
   different person who happens to share something. `isSamePerson` is false.
5. If no candidate passes, **stop**. Leaving "Pmarchetti" in the CRM is the correct
   outcome when you do not know. A miss stays a miss.

Somebody whose LinkedIn URL is **already on the record** has been through all of
this before. Do not re-run it to get a picture — `fetch_contact_photo` is one
call, and the URL sitting there is the verification.

## Reporting the match

Only call `identify_contact` when the tool says to. Pass **the `evidence` array
returned by `get_linkedin_profile`** (or CRM kinds you actually observed). Do not
invent kinds to raise a band.

| What you have | Evidence to record | What the write path does |
| --- | --- | --- |
| `isSamePerson` true | tool's `linkedin.employer-and-name` | Clears the VERIFIED floor; writes the name when no human owns it. |
| They replied from that address | `crm.thread-reply` | Clears the VERIFIED floor; same write rule. |
| Email shown on the profile | `profile.email-match` | Clears the VERIFIED floor; same write rule. |
| Employer only, name fails | tool's `employer-only` | Below the keep floor. **Not stored.** Stop. |
| Name only, employer fails | empty evidence | Not them. **Do not identify.** Stop. |
| Sources disagree | add a `contradiction` entry | Held. Nobody is shown a guess. |

`record_fact` / `identify_contact` price evidence in code (`lib/evidence.ts`).
You never set a confidence score. Bands and `fillsBlank` decide apply vs propose:

- Below the floor → not stored (miss stays a miss).
- Clears the floor and the field is blank (or a derived placeholder name) → applied.
- Clears the floor but a value is already filled and the band is not VERIFIED → proposal for a rep.
- A human-typed name always wins over agent evidence.

Do not add evidence you did not observe to push a claim over a line.

## Things that look like evidence and are not

- **A search result.** Search says where to look. A query for "Paula Marchetti"
  once returned Brightwater's CEO, an HR lead at Reply, and a data engineer in
  Seattle — all with total confidence.
- **A matching first name.** Half the Chrises at a company are not your Chris.
  The surname or the employer has to carry it.
- **Perplexity's view of somebody's job title.** It aggregates stale sources; it
  said "Account Executive L3" for a profile that reads "Growth Specialist at
  Fernhill". For identity, the person's own profile wins. Perplexity is not the
  slug finder.
- **A very plausible expansion.** `jsmith` is probably J. Smith. Probably is not
  a source.
- **LinkDAPI people search.** Broken; returns unrelated people. Never use it.

## When the person genuinely is not findable

Some people have no profile, or a profile with no employer, or a name that
cannot be reconciled with their address. Say so plainly and move on. A contact
that keeps its placeholder name is a contact a human can fix in five seconds; a
contact with the wrong person's job history is one nobody knows to fix.
