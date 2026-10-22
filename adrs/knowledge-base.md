# A knowledge base the agents can read

Having the agents built into the CRM is awesome. They already get some context
from the website you fill in on the settings page, and from whatever they turn up
by web research. That is not enough.

What makes a sales agent great is understanding the company's mission, its ICP,
its full feature set, the value props for particular customers, playbooks on how
the company wants to sell, and competitive battle cards. None of that is on our
website, and web research cannot reach any of it. So the agents inside the CRM
cannot possibly get any of this today. They answer questions about fit and pitch
from whatever they can scrape, which comes out generic and off-message.

I want somewhere in the CRM to put that internal knowledge. It is useful for the
humans as well, by the way. Today it sits in whatever document the person who
wrote it happened to use, and the rep who needs the ICP goes looking for it.

## What I'd do

Markdown entries at `/knowledge`. Every member reads and writes them. A shared
team wiki that only admins can edit does not get written.

Agents get `list_knowledge` and `read_knowledge`. The session preamble opens with
an index of what exists, so the model knows to go and look before it answers
about fit, pitch or demo. Writes only work in an attended session, so a
dispatched research task or a deployed team agent cannot quietly rewrite the ICP
with nobody there to check it.

## What it breaks

A new table and one migration. Entries are global, with no `organizationId`,
which matches "One organization, and it is not a tenancy boundary" in
`docs/api.md`.

Entry text becomes model input, so the index escapes the markdown it emits and
collapses whitespace. That way a title cannot open a heading or a list item.
Nothing that exists today changes behaviour. The preamble gets one more block.

I have this built and working if you want the code, but I'm leading with the
idea.
