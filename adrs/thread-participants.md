# Threads should know all their participants

I built a multi-channel CRM a while back (Telegram, MAX, Avito), so I have been reading
this repo with the channel requests in mind. WhatsApp is still open in #50, Outlook was
asked for in #47 and has now shipped, and the mailbox code was just pulled out into a
provider-agnostic `mailbox/` module to make room for it.

That refactor is what prompted this. The provider abstraction is there now, but one
assumption came through it unchanged, and it is already wrong with just email.

A thread is attached to exactly one contact. `thread-writer.service.ts` collects every
participant:

```ts
const participants = [parsed.from, ...parsed.recipients];
```

and `mailbox-match.service.ts` hands back a single id:

```ts
const contact = await this.db.contact.findFirst({
  where: { email: { in: external.map((person) => person.email) } },
});
```

`findFirst` with no `orderBy`, so a thread with three known contacts lands on whichever
row Postgres returns first. The other two exist only as strings inside
`EmailMessage.recipients`.

That matters more here than it would in most CRMs, because of what `read_crm_history` is
for. `identity-matching.md` calls it the strongest evidence available anywhere and says
to start every match there rather than at a search engine. It reads
`emailThread.findMany({ where: { contactId } })`. For the two participants who lost the
coin flip the thread does not exist. The agent reports no history and goes off to pay for
a lookup, while the reply that would have settled it is sitting in the database.
`crm.thread-reply` is unavailable for exactly the people who did reply.

What I would do is add a join table between threads and contacts, and keep
`EmailThread.contactId` as the primary contact so nothing existing breaks. The sync
writes a row per participant it can resolve. `read_crm_history` reads through the join
instead of the direct foreign key.

What it costs: a migration and a backfill over existing threads, and any query that
assumes one contact per thread has to decide whether it wants the primary or all of them.
The agent tools are the interesting part of that decision, not the UI.

I hit this in my own CRM early and ended up with a `ConversationContact` join for the
same reason. A conversation with two people from the client company is not an edge case,
it is Tuesday. Once a channel arrives that has no To field to pick a winner from, there
is nothing left to guess with.
