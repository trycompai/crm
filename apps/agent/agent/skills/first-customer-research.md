---
description: Use for every prospect-research task. Finds current public pain and timing signals, especially official job postings, verifies the relevant named person and work route, separates observation from inference, scores fit, and records a conversion-ready prospect without sending outreach.
---

# First customer research

Use public sources only. Do not use private groups, gated communities, data brokers, scraped contact databases or sources that prohibit access. Never send outreach, submit a form, connect, follow or comment.

Do not invent a signal, person, title, address or date to complete a record. A missing field is safer than a persuasive guess.

## Research order

1. Call `read_prospect`.
2. Fetch the official website with `fetch_prospect_source` and retain its receipt id.
3. Use `search_public_web` to find the official careers page and individual current job postings. Prefer roles that reveal coordination load: estimating, project management, operations, scheduling, procurement, crew leadership, client service, finance, design-to-build handoff or multi-site delivery.
4. Fetch the strongest individual job posting with `fetch_prospect_source`. A careers index with no specific vacancy is not a job posting. A dedicated vacancy or an official page section naming a current role with duties or application details is `OFFICIAL_JOB_POSTING`. Record a visible publication date when one exists; never manufacture one.
5. Inspect current official project, news, award, expansion and service pages.
6. Search official team, leadership and about pages for the current decision-maker whose remit owns the evidenced problem. Do not stop at an unrelated named employee. If official pages do not identify the right owner, inspect a public professional source. Leave the person blank rather than naming someone whose remit does not fit.
7. Find a public direct work email only from a page that visibly publishes it or from a current public professional source. Never infer an address pattern, buy contact data, use a private address or keep a generic inbox.
8. Fetch every retained source with `fetch_prospect_source`. Search snippets and unreceipted text are not evidence. Recheck existing sources and omit anything gone, stale or no longer supportive.
9. Call `record_prospect_research` with all retained evidence. If it rejects one source because the observation does not match its fresh receipt, remove or rewrite only that unsupported source and make one corrective call. Stop after the first successful write or one corrective call.

## Evidence record

For every source retain its receipt id, type, final URL, visible publication date or no date, concise summary, direct observation copied from the fetched page and separate inference. The recording tool rejects an observation that cannot be found in the receipt text. Attribution phrases such as "the page says" are fine, but every substantive fact must remain visible in the receipt.

Set `primaryEvidenceUrl` to the strongest retained source behind the pain signal and draft. Prefer the most relevant dedicated official job posting.

The `personSourceUrl` must also be one of the retained sources and must directly support the person's current role.

## Prospect card

Write:

- `companyProof`: what official sources establish about the company
- `painSignal`: the strongest current public problem or trigger
- `whyFit`: why Lode fits that evidenced work
- `whyNow`: why the timing matters now
- `suggestedChannel`: the relevant verified route
- `caution`: freshness, ambiguity or validation warning
- `personalHook`: a public role-relevant detail about the named person
- `jobDayProblem`: the concrete operating problem that person likely owns, clearly marked as inference unless directly stated
- `nextAction`: the next review or research step
- `draftSubject` and `draftBody`: an unsent first email for human review

Keep the draft under 120 words. Address the named person only when the role is current. Refer to the strongest public context, name one operating problem, explain Lode in one sentence and ask one low-friction question. Do not claim private knowledge and do not imply the message has been sent.

## Scoring

Score 0 to 5 from retained evidence:

- pain strength, 25 percent
- product fit, 25 percent
- timing, 20 percent
- public reachability, 15 percent
- evidence quality, 15 percent

The recording tool calculates the weighted 0 to 100 score. Give the supported score, not the score needed to pass.

## Automatic promotion

Promotion into Company and Contact records is deterministic and separate from permission to send. It requires 5/5 in every dimension, at least two observed public sources, a dated official company-domain job posting from the last 120 days, complete rationale and draft, a confirmed relevant person and role, and a non-suppressed direct public work email. It never sends the draft. Anything less remains a rich prospect for review and scheduled re-research.
