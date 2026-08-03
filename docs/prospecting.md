# Product prospecting

The CRM has one review-first acquisition pipeline for BeamDeploy, PropMargin
and Arquivo de Faturas. It discovers and scores candidates, preserves the
evidence used, receives consented product-form leads, and sends only messages a
reviewer has approved. It never sends directly from a discovery result.

## Default operating model

| Product | Market | Discovery/day | Send/day | Initial offer |
| --- | --- | ---: | ---: | --- |
| BeamDeploy | Portuguese and international software companies | 50 | 12 | Starter, €29/month |
| PropMargin | Portuguese property investors, renovators and promoters | 25 | 7 | Project Pass, €49 |
| Arquivo de Faturas | Portuguese small businesses and administrative teams | 25 | 6 | Essencial, €6.99/month |

Products are seeded inactive. An administrator assigns a sender mailbox,
grants that mailbox Gmail send permission, confirms commercial readiness and
then activates discovery. Arquivo de Faturas must remain commercially blocked
until its legal/fiscal copy, billing and SIBS path are ready.

## Services

- **Hunter Discover** finds B2B companies from a natural-language ICP; Domain
  Search provides professional contacts and their public sources. Discover is
  free at the time of implementation; Domain Search consumes Hunter credits.
- **Brave Search API** adds current public-web evidence such as hiring,
  technology and business-activity signals.
- **GitHub code search** adds public technology signals for BeamDeploy when a
  token is configured. It is supplementary and never a contact source.
- **Context.dev and Perplexity** remain the existing optional company and web
  research capabilities. There is no unofficial LinkedIn dependency.
- **Google Workspace / Gmail API** sends from one explicitly assigned CRM user
  per product. Each sender signs in and grants `gmail.send`; the existing Gmail
  sync detects replies and opt-outs.

Official contracts: [Hunter API](https://hunter.io/api-documentation),
[Brave Web Search](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started),
[GitHub code search](https://docs.github.com/en/rest/search/search), and
[Gmail threads](https://developers.google.com/workspace/gmail/api/guides/threads).

## Review and follow-up lifecycle

1. A weekday scheduler creates a capped run at 08:00 Europe/Lisbon.
2. The agent queries available providers, deduplicates by product/domain or
   hashed email, writes evidence, and deterministically scores fit, intent and
   contactability.
3. Only candidates scoring at least 70 with two evidence items enter `REVIEW`.
4. A reviewer approves or rejects the candidate, writes a personalised draft,
   and approves that message separately.
5. The API rechecks suppression, consent/compliance, commercial readiness,
   sender scope, schedule and the Lisbon daily cap immediately before sending.
6. Follow-ups are separate drafts and approvals at business days 4 and 10.
   They keep the original Gmail subject and RFC reply headers.
7. An inbound reply cancels every unsent follow-up. An opt-out also creates a
   durable hashed suppression entry.

## Consent and Portuguese safeguards

- Individuals are ineligible for electronic outreach without recorded consent.
- Voluntary product-form leads carry the consent timestamp, policy version and
  source. Arquivo de Faturas forwards only after double opt-in confirmation and
  forwards removal as a suppression event.
- Portuguese company outreach is blocked until an administrator imports a
  current DGC opposition-list snapshot. A snapshot older than 35 days blocks
  sending. This technical control does not replace legal review of the actual
  campaign, lawful basis, copy or authoritative list format.
- Rejected uncontacted candidates expire after 90 days; contacted/consented
  records use a two-year operational retention marker, subject to product
  privacy commitments and deletion workflows.

## Product form integration

Each product posts to `POST /integrations/v1/leads` with a millisecond timestamp
and an HMAC-SHA256 signature over `<timestamp>.<exact-body>`. Removal events post
the same way to `/integrations/v1/suppressions`. Secrets are separate per
product. Payloads are strictly validated, limited to 32 KiB and protected
against five-minute replay windows; lead event IDs are persisted for
idempotency.

Product-side forwarding is optional and best effort: a temporary CRM outage
must not break a customer's form or double-opt-in confirmation. Failed
forwarding is logged without the submitted email or request body.

## Before first live send

1. Create three Google Workspace sender users and have each grant Gmail send.
2. Set Hunter and Brave keys on the agent deployment.
3. Generate and distribute the three HMAC secrets; never reuse them.
4. Import and independently validate the current DGC corporate opposition list.
5. Set the offer URL and sender on each product; mark only ready products as
   commercially ready.
6. Activate BeamDeploy first at a reduced cap, review every draft and validate
   reply/opt-out handling before enabling the national campaigns.
