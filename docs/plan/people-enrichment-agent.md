# Plan — People enrichment agent (eve + LinkedIn)

An [eve](https://eve.dev/docs) agent that works out who the people in the CRM
actually are, using real profile data rather than inference.

**Historical.** The agent this planned is built and [`agent.md`](../agent.md)
describes what it does now. One decision below did not survive: LinkedIn no
longer comes from a third-party LinkedIn API of its own. Context's people enrich
endpoint reads a person back from a URL, under the same key that already buys
company brand data, so there is one vendor and one key rather than two.

Read it with [`AGENTS.md`](../../AGENTS.md), [`api.md`](../api.md),
[`design.md`](../design.md) and
[`gmail-calendar-plan.md`](./gmail-calendar-plan.md), whose sync is what puts
these contacts in the CRM in the first place.

---

## 0. Phase 0 is done — what the API actually does

Run against the real key on 2026-07-31, using addresses from our own CRM. This
section exists because it **changed the architecture**, and because half of it
contradicts the vendor's own marketing page.

### People search is broken. Do not build on it.

`GET /api/v1/search/people?keywords=...` returns `HTTP 200` with a well-formed
payload of **entirely unrelated people**. `keywords=marchetti fernhill` returned a
list of Seattle-area engineers; `keywords=Paula Marchetti` returned Italian
executives — Brightwater's CEO, an HR lead at Reply. Different random set each time.
The parameter appears to be ignored.

This matters more than a broken endpoint usually would: search was the entry
point of the original design. Email → search → candidates → match was the whole
identity-resolution flow, and it does not exist.

### What does work, and works well

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/v1/profile/overview?username=<slug>` | **Excellent** | Full name, headline, current positions with company URNs and logos, follower count, connection count, join date. |
| `GET /api/v1/companies/company/info?name=<slug>` | **Excellent** | Id, universal name, LinkedIn URL, tagline, full description. Takes `name`, *not* `username`. |
| `GET /api/v1/profile/contact-info?username=<slug>` | Works | — |
| `GET /api/v1/profile/skills` | Exists, different params | Rejects `username`; wants a URN or profile id. |
| `profile/experience`, `profile/posts`, `companies/company/employees` | **Do not exist** | 404 under the documented names, despite being on the marketing page. The real names need finding before anything depends on them. |

### The architecture this forces — and it is better

LinkDAPI is an **enricher, not a finder**. Given a slug it is superb; given a
name it is useless. So the resolver stage moves to a real search engine:

```
email + company  →  Context.dev web search (site:linkedin.com/in)  →  slug
slug             →  LinkDAPI profile/overview                      →  deep structured profile
```

Proven end to end on a real CRM contact:

```
tokonkwo@northwind.com
  → site:linkedin.com/in tokonkwo "Northwind"
  → tomi-okonkwo
  → Tomi Okonkwo — VP, Fund Finance & Venture Lending — Northwind Bank
```

`y` + `okonkwo`. That is the "Tokonkwo" row from the contacts list, resolved to a
real person with a real title at the right employer.

It also means the two vendors are used for what each is actually good at.
Context.dev is a search engine and cannot read LinkedIn (LinkedIn blocks
scrapers); LinkDAPI can read LinkedIn and cannot search. Neither alone solves
this.

### Hit rate is partial, and that is the honest headline

`pmarchetti@fernhill.com` resolved to **nothing** — no candidate slug at all. An
unusual local part at an 8,000-person company is the hard case, and it is the
one that prompted this work. Expect a meaningful miss rate on exactly the
contacts that look worst in the UI.

Two consequences:

- The fallback matters. When no slug resolves, the existing Context.dev
  extract path still runs and may find a team page.
- **A miss must stay a miss.** With search returning plausible strangers, the
  temptation to accept a near-match is exactly how Dario Fontana ends up
  filed as Paula Marchetti. §5's confidence bands are not ceremony.

### A bug this spike caught in already-shipped code

Context.dev's `web.search` rejects `numResults < 10`. `ContextDevClient.search`
defaulted to 5, so **every call would have failed validation** — the contact
enrichment shipped last turn could never have worked. Fixed; worth recording as
the reason to spike against a real key rather than a type definition.

---

## 1. What this is actually for

The prompt for this was a contacts list reading `Pmarchetti`, `Tokonkwo`, `Chris` —
names derived from an email address because Google Calendar returned no
`displayName`. Fixing those is the *entry* case, and on its own it would not
justify an agent.

The reason to do this properly is what a profile carries beyond a name:

| Signal | Why a CRM wants it |
| --- | --- |
| Full name, headline, title | The contacts list stops looking broken. |
| Work history and tenure | "Started 3 months ago" is a different conversation from "eight years in seat". |
| **Job changes** | A champion moving to a new company is the single highest-intent event in B2B sales, and nobody sees it today. |
| Seniority and function | Who actually signs, versus who you have been emailing. |
| Company headcount and growth | Qualification, without asking. |
| Mutual connections | A warm path in. |

The agent does **both**: it fills the fields *and* it produces the output. The
fields are the substrate — you cannot write "you are meeting the VP who joined
four months ago" without knowing the title and the start date — and the output
is the reason anyone opens the CRM. Neither half is optional, and shipping only
the fields is what makes enrichment feel like admin.

Job-change detection is the prize. It is also impossible without a people data
source, which is why the existing Context.dev path cannot grow into it alone.

### What exists today, and what happens to it

`ContactEnrichmentService` (`apps/api/src/enrichment/contact-enrichment.service.ts`)
already does a sourced web lookup: search, read a page, write only what the page
states. It is deliberately timid — it refuses to guess, so it returns nothing
for most people.

It is **not** deleted by this plan. It becomes the fallback the agent reaches
for when LinkedIn has no match, which is common for junior people, non-US
markets, and anyone who does not keep a profile. §5.

---

## 2. The decisions that carry the design

1. **Curated tools, not a raw OpenAPI connection.** Not to save money — one won
   deal at $10–15k ARR funds more enrichment than this will ever run. Because
   the surface is not trustworthy: several advertised endpoints 404 and the
   search endpoint returns confident nonsense (§0). Tools pin the agent to what
   is verified to work. §4.
2. **The agent proposes; the CRM decides.** Writes go through one tool that
   stamps provenance, and a low-confidence identity match is approval-gated
   rather than merged. Getting a person wrong is worse than not knowing them. §6.
3. **Identity matching is the hard part, not data fetching.** `pmarchetti@fernhill.com`
   → which of the four Marchettis at a 8,000-person company? This gets a skill, a
   confidence rubric and evals. §5.
4. **A separate Vercel app, sharing `@crm/db`.** eve is its own runtime with its
   own build; it does not embed in NestJS. It reads and writes the CRM through
   the workspace database package, not through a new internal HTTP API. §3.
5. **Rate limits are a correctness concern, not a billing one.** A 429 mid-run
   is a half-enriched contact. The token bucket exists so the agent never
   discovers the tier cap. §7.
6. **Provenance on every field.** Which endpoint, which profile URL, when,
   how confident. Without it nobody can tell an enriched field from a typed one,
   and nobody will trust either. §6.

### Choice table

| Decision | Choice | Why |
| --- | --- | --- |
| Framework | eve, `apps/agent`, own Vercel project | Durable sessions, approval gating, schedules and evals are all things we would otherwise hand-roll. |
| Model | `anthropic/claude-sonnet-5` via AI Gateway | The default. Routes over project OIDC, so no provider key to manage. Matching is not a frontier-model problem; revisit if eval scores say otherwise. |
| LinkedIn access | LinkDAPI, **profile + company endpoints only** | Its people *search* is broken — §0. Profile-by-slug and company-by-name are excellent. Superseded: Context's people enrich reads the same profile under the key we already hold. |
| Finding the person | Context.dev web search resolves the LinkedIn slug | §0. The one thing LinkDAPI cannot do, and the thing a real search engine is good at. |
| Tool surface | Curated tools, not an OpenAPI connection | Not cost — *predictability*. Half the advertised endpoints do not exist under the documented names (§0), so the surface has to be pinned to what is verified. |
| CRM access | `@crm/db` directly | Already a workspace package. A second internal API would be plumbing with no reader. |
| Trigger | eve schedule (Vercel Cron) over a bounded queue | Same shape as the Google sync — cursor in Postgres, work bounded per tick. |
| Write path | One `update_contact` tool, provenance stamped | §6. |
| Low confidence | eve `approval: always()` on merges below the bar | §6. Cheap to add now, impossible to retrofit trust later. |
| Fallback | Existing Context.dev search | Covers the long tail LinkedIn misses. |
| Retention | Raw payload in `ContactEnrichment`, mirroring `CompanyEnrichment` | Re-deriving a field later costs nothing — the pattern already paid off once, for `iconTone`. |
| Coverage | Every contact with a work domain, re-checked on a cadence | Billing is not a constraint: one won deal at $10–15k ARR pays for far more enrichment than this will ever run. |

### Judgment calls worth your veto

- **Curated tools rather than the full API.** You lose the agent's ability to
  improvise across endpoints we did not anticipate. You gain a predictable bill.
  If a use case turns up that the four tools cannot serve, add a fifth — that is
  cheaper than discovering an agent spent 4,000 credits exploring.
- **Job-change detection is Phase 4, not Phase 1.** It needs a baseline to
  diff against, so it cannot exist until enrichment has been running a while.
  Worth saying out loud because it is the most valuable part and it is last.
- **The agent never emails anyone.** It reads, matches and writes CRM fields.
  Outbound stays a human action. eve makes it easy to give an agent a channel
  and a send tool, and that is a different product decision with a different
  risk profile.
- **Contacts only, initially.** LinkDAPI's company endpoints are tempting, but
  Context.dev already fills company firmographics and two sources writing the
  same columns is a merge conflict nobody owns. §8.

---

## 3. Where it lives

eve is a filesystem-first framework: an agent is a directory, and the slot a
file lands in determines how it loads. It builds and runs as its own app, so it
becomes a third workspace app beside `api` and `app`.

```text
apps/agent/
├── package.json          # name = "agent"; the root agent takes its name from here
├── agent/
│   ├── agent.ts          # model + runtime config
│   ├── instructions.md   # what the agent is for and what it must not do
│   ├── lib/              # shared helpers — import-only, never reaches the sandbox
│   │   ├── linkdapi.ts   # typed client: auth, retry, rate limit, credit accounting
│   │   └── crm.ts        # @crm/db queries the tools call
│   ├── tools/            # one file per tool; filename IS the model-facing name
│   │   ├── find_person.ts
│   │   ├── get_profile.ts
│   │   ├── find_colleagues.ts
│   │   └── update_contact.ts
│   ├── skills/
│   │   └── identity-matching.md
│   └── schedules/
│       └── enrich.ts     # becomes a Vercel Cron Job on deploy
└── evals/                # sibling of agent/, not inside it
```

Naming is path-derived — `agent/tools/find_person.ts` is the tool `find_person`,
and you never write a `name` field.

**Deployment.** `eve link` creates/links a Vercel project and pulls its env.
Schedules become Vercel Cron Jobs, evaluated in UTC. A string model id routes
through the AI Gateway authenticated by project OIDC, so there is no Anthropic
key to rotate. Note that `eve dev` never fires schedules on their cadence —
there is a dispatch route for triggering one while iterating.

**Monorepo wiring.** `apps/agent` joins the bun workspace and gets a
`turbo.json` declaring `passThroughEnv` for `DATABASE_URL` and the vendor keys,
matching how `apps/api` does it. `check-types` and `lint` join the root
pipeline; `build` is `eve build`.

---

## 4. The tools

Four, deliberately. Each one runs in the app runtime with access to
`process.env` and `lib/`, and each is a place to put a rate limiter rather than
hope the model paces itself.

| Tool | Wraps | Notes |
| --- | --- | --- |
| `resolve_profile` | Context.dev `web.search`, `site:linkedin.com/in` | Turns an email + company into **candidate slugs**. Never returns a match — returns candidates for §5 to judge. This replaces the LinkDAPI search that does not work. |
| `get_profile` | LinkDAPI `profile/overview` (+ `contact-info`) | One slug, in full. The deep data nothing else can reach. |
| `get_company` | LinkDAPI `companies/company/info?name=` | Tagline, description, LinkedIn URL — company context for a brief. |
| `research_web` | Context.dev `web.extract` | The fallback when no slug resolves, and the source of non-LinkedIn context (funding, launches) for briefs. |
| `update_contact` | `@crm/db` | The only write. §6. |

Two things go in `lib/linkdapi.ts` rather than in each tool:

- **A token bucket sized to the tier.** Testing is 7 requests/minute, Hobby 30,
  Developer 70. Not a cost control — a 429 in the middle of a run leaves a
  half-enriched contact, and the agent must not be the thing that discovers the
  cap.
- **Call accounting.** Endpoint plus the contact it was for. Not for the bill,
  for the debugging: when a profile comes back wrong you want to know exactly
  what was asked.

A note from eve's own docs that applies here: *a step interrupted mid-execution
re-runs*, so anything non-idempotent must be made idempotent or gated. Our
writes are upserts keyed on contact id, so a replay is free; the *credit spend*
is not, which is another reason the counter is on the client and not the tool.

---

## 5. Identity matching

The actual problem. `pmarchetti@fernhill.com` is one address at a company with
thousands of employees, and picking the wrong Marchetti writes a real person's
career history onto the wrong CRM record.

This gets a **skill** — an on-demand procedure the agent loads when it needs it —
rather than being buried in the system prompt:

`agent/skills/identity-matching.md` sets out the evidence hierarchy:

1. **Exact email on the profile** — decisive. LinkDAPI exposes contact info on
   some profiles; when the address matches, the match is certain.
2. **Local-part decomposition against a real name.** `pmarchetti` is consistent
   with `a` + `marchetti` and with `abi` + `gham`. Checked *against candidates*,
   never used to generate a name — the direction matters, and it is the whole
   difference between this and guessing.
3. **Company match**, current employer equals the contact's company.
4. **Corroboration** — the meeting we already synced, the thread they replied
   on, the title they signed off with in an email footer.

And the confidence bands the write path keys on:

| Confidence | Evidence | Behaviour |
| --- | --- | --- |
| `high` | Email match, or unique local-part decomposition at the right company | Merged automatically. |
| `medium` | Consistent decomposition but more than one plausible candidate | Written as a **suggestion**; a rep accepts or rejects. |
| `low` | Company match only | Discarded. Not stored, not shown. |

When LinkDAPI returns nothing, the agent falls back to the existing Context.dev
search path, which is already sourced and already refuses to guess.

**Evals live and die on this.** `evals/` gets a fixture set of real addresses
with known answers — including the ones that *should* resolve to nothing — and
the metric is precision first: a wrong merge costs more than a missing one.

---

## 6. Writing back, and provenance

One tool, `update_contact`, and it never writes a bare field:

```prisma
model ContactEnrichment {
  contactId  String   @id
  contact    Contact  @relation(fields: [contactId], references: [id], onDelete: Cascade)
  source     String   // "linkdapi" | "context.dev"
  sourceUrl  String?  // the profile the claim came from
  confidence String   // high | medium | low
  raw        Json     // the payload, so re-deriving costs nothing
  fetchedAt  DateTime @default(now())

  @@map("contactEnrichment")
}
```

Mirrors `CompanyEnrichment` deliberately: keeping the raw payload has already
paid for itself once — `iconTone` and `iconDarkUrl` were backfilled for every
company from stored payloads without spending a credit.

`Contact` gains `enrichmentStatus`, `enrichedAt` and `enrichmentError` matching
`Company`, so the UI reuses `isEnriching()` / the existing poll rather than
inventing a second freshness mechanism (`api.md`: background writes the browser
cannot see are polled, not invalidated).

**Approval.** eve's `approval: always()` pauses a tool call durably until a
person signs off. `update_contact` takes a policy rather than a flag: automatic
at `high`, approval-gated at `medium`. eve's own responsible-use guidance is
that agents run permissively unless you configure otherwise and that model
behaviour alone should not be relied on to prevent sensitive writes — a
confidence rubric in a prompt is model behaviour; the approval policy is not.

**Never overwrite a human.** Same rule the rest of the codebase already
follows: `brandToUpdate` fills only empty fields, and `isDerivedName()` is
already the test for "this name is a placeholder nobody has improved on".

---

## 7. Scheduling and coverage

`agent/schedules/enrich.ts` — a `defineSchedule` with a `run` handler rather
than a markdown prompt, because the batch has to be selected in code:

```ts
export default defineSchedule({
  cron: "*/10 * * * *",
  async run({ receive }) { /* claim a bounded batch, hand each to the agent */ },
});
```

Sizing is set by the rate limit, not the budget:

- **Batch size** is the per-minute cap times the tick, with headroom. At
  Developer (70/min) and a 10-minute tick that is hundreds of contacts, which is
  more than the whole database.
- **Every contact with a work domain**, not just the ones with ugly names and
  not just the ones on open deals. A correct title on a contact nobody is
  actively selling to is what makes the *next* deal's brief good.
- **Re-check on a cadence, not once.** A profile read once is a fact that decays;
  a profile read every 30 days is a job-change feed (Phase 4). This is the
  single biggest behavioural difference the "billing is irrelevant" call buys,
  and it is worth taking deliberately rather than by omission.

Pick the tier from the measured request rate, then stop thinking about it.

---

## 8. What this does *not* touch

- **Company firmographics.** Context.dev owns those columns. LinkDAPI's company
  endpoints are for *people* context — headcount, who works there — and land in
  new fields or not at all.
- **The Google sync's matching.** `GoogleMatchService` decides which company a
  thread belongs to. That is a different question from who a person is, and
  merging them would couple a cheap local decision to a paid network call.
- **Outbound anything.**

---

## 9. The part to decide before building

LinkDAPI is an **unofficial** LinkedIn API. Using it is a business decision, not
a technical one, and it belongs to you rather than to this plan — but it should
be made deliberately rather than discovered:

- **LinkedIn's terms prohibit automated collection**, and they enforce against
  it. The exposure is to the data provider and to LinkedIn, not to a court's
  view of the CFAA, which `hiQ v. LinkedIn` largely settled in favour of public
  data. Practically: this is what Apollo, Clearbit, ZoomInfo and most of the
  sales stack do, and it is priced accordingly.
- **This is personal data under UK/EU GDPR** even though it is professional and
  public. What that actually requires of an internal B2B CRM: a lawful basis
  (legitimate interest is the usual one, and wants a balancing test on file), a
  retention period, and the ability to answer an access or erasure request.
  `ContactEnrichment` with `sourceUrl` and `fetchedAt` is most of the answer —
  it makes "where did this come from and when" a query rather than an
  investigation.
- **Keep it to business context.** Name, title, employer, tenure, public
  profile. Nothing about a person outside their work, and none of the special
  categories, regardless of what an endpoint returns.
- **Single-provider risk.** An unofficial API breaks when LinkedIn changes.
  `lib/linkdapi.ts` being the only file that knows the vendor is what makes
  swapping it a day rather than a rewrite.

None of this blocks the build. It does mean §6's provenance is not a nicety —
it is the thing that makes the rest defensible.

---

## 10. Phases

| Phase | Scope | Done when |
| --- | --- | --- |
| **0 — Spike** | ~~Prove the API resolves real CRM addresses~~ | **Done — §0.** Search is unusable; profile and company are excellent; the hybrid resolver works end to end on a real contact; hit rate is partial. |
| **1 — Skeleton** | `apps/agent`, `eve link`, `update_contact` writing to `@crm/db`, schedule claiming a batch, no LinkedIn | A contact's title changes because the agent changed it, on a cron, in a deployed environment. The loop is proven before the vendor is in it. |
| **2 — Enrichment** | Five tools, `identity-matching` skill, confidence bands, `ContactEnrichment` | `Tokonkwo` becomes Tomi Okonkwo, VP Fund Finance at Northwind Bank, with a `sourceUrl` against it — and an ambiguous address becomes a suggestion rather than a wrong answer. |
| **3 — Trust** | Approval on `medium`, evals with a labelled fixture set, provenance in the contact sheet | Precision measured, not asserted. A rep can see where a field came from. |
| **4 — Meeting prep briefs** | On a calendar event with external attendees, research everyone and write a brief to the timeline before the call | Opening a company the morning of a call shows who is attending, what they do, how long they have been there, what the company just announced, and where the deal stands. **This is the feature people will describe to other people.** It is only possible because the Calendar sync already knows the meeting is coming. |
| **5 — Job changes** | Re-read on a 30-day cadence, diff against the stored payload, activity + task on a move | A champion changing employer creates an activity on their old company's timeline and a task for their owner. The highest-intent signal in B2B, and nobody else in the stack sees it. |

Phase 0 already earned its keep: it deleted the original resolver design, found
a shipped bug, and replaced a marketing-page assumption with a measured one.

The ordering after that is deliberate. Phases 1–3 make the data trustworthy;
4 and 5 are what a rep would actually miss if you took it away. Resist doing 4
first — a brief built on unverified identities is confidently wrong in front of
a customer, which is the one failure mode that costs a deal rather than a
click.

---

## 11. Open questions

1. **Whose credits?** One shared app key (`principalType: "app"`, which is
   eve's default when `getToken` is the only auth), or per-rep? Shared is
   simpler and almost certainly right for an internal tool.
2. **Does a `medium` suggestion surface in the UI, or a queue?** The Gmail plan
   argued against approval queues because they rot. A suggestion inline on the
   contact — "LinkedIn thinks this is Paula Marchetti · accept" — probably beats a
   separate inbox, but it is more UI work.
3. **Retention.** How long does `ContactEnrichment.raw` live? It is the thing
   that makes re-derivation free and the thing an erasure request is about.
4. **Do we enrich every contact, or only ones on open deals?** Every contact is
   simpler; deal-scoped is far cheaper and probably where the value is.
5. **Is `find_colleagues` allowed to create contacts?** Listing a company's
   employees is a lead-generation capability, not an enrichment one. It should
   not create records in v1, and that line is worth holding deliberately.
