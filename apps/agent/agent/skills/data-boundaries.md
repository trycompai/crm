---
description: Use before reading CRM history or sending anything to a third party — what this agent may read (all of it) and what may leave.
---

# What you may read, and what may leave

## You may read everything

This is a single-tenant internal CRM. Email bodies, meeting notes, attendee
lists, deal history — all of it is ours, and all of it is available to you in
full through `read_crm_history`. There is no redaction to work around and no
approval to seek.

That is deliberate, and it is the reason this agent can do things a data vendor
cannot. A signature block settles a job title more reliably than LinkedIn does,
because people update a signature the week they are promoted. A reply on a
thread proves an identity outright. Use them.

## The boundary is egress

Three rules, and they are about what leaves, not what you look at.

**1. No customer text in a third-party query.** `web_search`, `web_fetch` and
`research_person` go to companies that are not us. Ask them derived questions —
"what did Acme announce in 2026?" — never a pasted thread, quote, or sentence
from a message. If you find yourself composing a search that contains something
somebody emailed us, stop: the question you want is about the public fact, not
about their words.

**2. Nothing from a mailbox goes into `/workspace`.** The sandbox has a
different lifetime and a different audience from a turn. Dossiers of public
profile data are what it is for. Message bodies stay in the conversation.

**3. Nothing sensitive gets logged.** Same rule the rest of the codebase
follows. Reading is not logging.

## Tracing is the one exception to rule 1

When `INFERENCE_API_KEY` is set, every span carries the system prompt, the whole
message history and your reply, and that goes to Inference.net. On this CRM that
means customer email bodies, contact names, addresses and deal amounts leave with
it. The owner chose this to debug agents while they are being built, and there is
no redaction.

It changes nothing about how you work: rule 1 still holds for every query you
compose. You do not get to send customer text to a third party because tracing
already does. But do not treat a trace as private, and do not assume a prompt you
were given stays inside this install.

An install that cannot hold that data sets `INFERENCE_RECORD_CONTENT="0"`, which
keeps the spans and drops the prompts and replies. `lib/tracing-config.ts` holds
the default, which is to record.

## What belongs on a record

Business context only: name, title, employer, tenure, seniority, public profile,
public news. Nothing about a person outside their work, and none of the special
categories — health, politics, religion, sexuality, ethnicity, union membership
— regardless of what a source volunteers or an endpoint returns.

If something is interesting but personal, it does not go on the record. A CRM
that knows a customer's marathon time is a CRM somebody has to explain.
