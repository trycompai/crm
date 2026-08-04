# Clay and Claap

Both integrations are inbound webhooks. They are disabled unless their independent
root environment secret is set, record every accepted event in `integrationEvent`,
and return the result of the first delivery for retries with the same event id.

The API only makes exact, deterministic matches. It never guesses a company, contact,
deal or owner. Clay supplies the records to write explicitly. Claap participants match
contacts by email, its recorder matches a CRM user by email, and a deal is attached
only when Claap sends the CRM deal id.

## Clay

Set `CLAY_WEBHOOK_SECRET`, then add an HTTP API enrichment column in Clay:

- method: `POST`
- endpoint: `https://<api-host>/integrations/clay`
- header: `Authorization: Bearer <CLAY_WEBHOOK_SECRET>`
- body:

```json
{
  "eventId": "/CRM Event ID",
  "ownerEmail": "owner@acme.com",
  "list": { "id": "/List ID", "name": "/List Name" },
  "campaign": { "id": "/Campaign ID", "name": "/Campaign Name" },
  "company": {
    "name": "/Company Name",
    "domain": "/Company Domain",
    "website": "/Company Website",
    "industry": "/Industry",
    "linkedinUrl": "/Company LinkedIn URL"
  },
  "contact": {
    "firstName": "/First Name",
    "lastName": "/Last Name",
    "email": "/Work Email",
    "phone": "/Phone",
    "title": "/Job Title",
    "linkedinUrl": "/LinkedIn URL"
  },
  "opportunity": {
    "name": "/Opportunity Name",
    "stage": "DEMO_BOOKED",
    "amount": "/Amount",
    "currency": "USD",
    "expectedCloseDate": "/Expected Close Date"
  }
}
```

`eventId`, `ownerEmail`, `company.name`, `company.domain`, `contact.firstName` and
`contact.email` are required. `ownerEmail` must exactly match a CRM user. Omit
`opportunity` to import only the company and contact. A successful import upserts the
company by domain and the contact by email, creates the optional deal, writes an
enrichment activity with the Clay list and campaign, and queues the normal company
and contact agent work.

Use a value that is unique to the intended delivery for `eventId`, such as a formula
combining the Clay row id with its revision. Reusing the exact value for a retry
deliberately returns the original result without writing a duplicate.

## Claap

Set `CLAAP_WEBHOOK_SECRET`, create a Claap webhook pointing to
`https://<api-host>/integrations/claap`, and use the same value as the webhook secret.
Subscribe to `recording_added` and `recording_updated`.

The endpoint accepts Claap's envelope containing `eventId` and `event`, and the
unwrapped event shape used by older webhook configurations. Claap's event id is the
idempotency key. For an unwrapped event, the key is `<event type>:<recording id>`.

The recording's `recorder.email` must exactly match a CRM user so the activity has an
honest author. Participant emails are matched to existing contacts; no new contacts
are inferred from a meeting. One matching contact is attached directly. A company is
attached when all matching contacts point to the same company. A deal is attached
only when `crmInfo.deal.id` or `deal.id` is an existing CRM deal id.

The meeting activity stores the title, time, takeaways, recording URL, participants,
action items, insights and transcript links. Ambiguous participant matches stay in
the activity metadata instead of being forced onto one contact.
