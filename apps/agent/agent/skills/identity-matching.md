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

What works is handing over every clue you already hold — the address itself, the
name on the record, the employer and its domain — and letting the resolver match
them against real profiles. The clues go into the **query**, and the answer comes
from the profile.

That is the shape of every match: say where to look, never what you will find.

## The procedure

0. **`read_crm_history` first.** It is free and it is often decisive. If they
   have ever replied to us from that address, you already have the strongest
   evidence available anywhere — `crm.thread-reply` — and a signature block may
   hand you their title as well. Start every match here, not at a search engine.
1. **`resolve_linkedin_profile`** when the record holds no LinkedIn URL. Pass the
   email, the company name and domain, and any first and last name the CRM has.
   It returns one candidate and a verdict. A candidate is a lead, not an answer.
2. **`get_linkedin_profile`** when the record already holds a LinkedIn URL, or to
   check a candidate at a different URL. Pass the email, company name
   and domain — **and the `contactId`**. It returns the profile, their full work
   history *and a verdict*, in one lookup. Passing the id is what lets it copy
   their photograph, which it does only if the verdict comes back positive, in
   code, without asking you. Leaving it out costs the contact their picture and
   saves nothing.

   Both calls cost the same, and they are the most expensive you have. Two or
   three lookups is the whole budget for a contact, so do not run both when one
   answers. A record with a LinkedIn URL needs step 2 only.
3. **Read the verdict, not the profile.** It checks three things:
   - `emailMatches` — the profile lists the address we are identifying.
   - `employerMatches` — a current position matches the company we have.
   - `nameMatches` — the real name is consistent with the email local part
     (`y` + `okonkwo` → Tomi Okonkwo).
4. **`emailMatches` settles it on its own.** The person put that address on their
   own profile. Nothing else you can observe is stronger.
5. **Otherwise both, or it is not them.** One of the other two is not a weaker
   match, it is a different person who happens to share something.
6. If no candidate passes, **stop**. Leaving "Pmarchetti" in the CRM is the correct
   outcome when you do not know.

Somebody whose LinkedIn URL is **already on the record** has been through all of
this before. Do not re-run it to get a picture — `fetch_contact_photo` is one
call, and the URL sitting there is the verification.

## Reporting the match

Call `identify_contact` with what you actually saw:

| What you have | Evidence to record | What happens |
| --- | --- | --- |
| `emailMatches` is true | `profile.email-match` | Written to the record. |
| Employer and name both pass | `linkedin.employer-and-name` | Written to the record. |
| They replied from that address | `crm.thread-reply` | Written to the record. |
| One check passes | `employer-only`, or the profile as `search.cites-profile` | Offered to a rep as a suggestion. |
| Sources disagree | add a `contradiction` entry | Held. Nobody is shown a guess. |

The `sourceUrl` to cite is the one the tool hands back — the profile URL the
person's own record lists. A lookup that comes back with no source is a lookup
you cannot write a fact from.

The `One check passes` row is the case this exists for. Four Marchettis work at Fernhill; a
human settles that in three seconds, and the old rule — throw away anything
short of certain — meant we paid for that lookup every run and learned nothing
from it. A suggestion is not a failed match. It is the match, handed to the one
person who can finish it.

Do not add evidence you did not observe to push a claim over a line.

## Things that look like evidence and are not

- **A search result.** Search says where to look. A query for "Paula Marchetti"
  once returned Brightwater's CEO, an HR lead at Reply, and a data engineer in
  Seattle — all with total confidence.
- **A matching first name.** Half the Chrises at a company are not your Chris.
  The surname or the employer has to carry it.
- **Perplexity's view of somebody's job title.** It aggregates stale sources; it
  said "Account Executive L3" for a profile that reads "Growth Specialist at
  Fernhill". For identity, the person's own profile wins.
- **A very plausible expansion.** `jsmith` is probably J. Smith. Probably is not
  a source.

## When the person genuinely is not findable

Some people have no profile, or a profile with no employer, or a name that
cannot be reconciled with their address. Say so plainly and move on. A contact
that keeps its placeholder name is a contact a human can fix in five seconds; a
contact with the wrong person's job history is one nobody knows to fix.
