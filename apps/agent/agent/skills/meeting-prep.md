---
name: meeting-prep
description: Use when a meeting-prep task is open — identify first if needed, then write a short Background brief only when identity is trustworthy.
---

# Meeting prep

Calendar sync enqueues a `meeting-prep` task (priority 200) for known contacts
on upcoming meetings who still have no Background panel. Your job is a rep-ready
brief by the night before — or a deliberate empty panel when identity is weak.

## Order of work

1. **`read_crm_history` first.** Free, often decisive. Threads and prior
   meetings settle identity and titles without a vendor call.
2. **Trustworthy identity, or stop.** Load `identity-matching`. If the contact
   is still a placeholder name with no LinkedIn and no applied name, run the
   identity path (`resolve_linkedin_profile` → `get_linkedin_profile` →
   `identify_contact`) before any brief.
3. **Write only when identity holds.** Call `write_brief` with evidence that
   proves who they are *and* supports the claims. The tool refuses garbage
   identity in code — do not try to push a weak match over the line.
4. **Shape.** Load `writing-a-brief`. Two or three sentences, third person,
   current role first. Empty structured lines beat guessed ones.
5. **Stop.** Nobody is waiting on chat. Record what you found and end.

## When to write nothing

- Identity fails both employer and name checks.
- The only material is the job title already on the record.
- Evidence is employer-only, a search hit, or meeting attendance alone.

An empty Background panel is the correct outcome. A wrong person on the panel
is the failure mode this path exists to prevent.

## What calendar already did

Nest only wrote the task row. It does not research, match identity, or score
people. Attendees without a CRM contact are not enqueued. Contacts that already
have a brief are skipped. Horizon is the next seven days.
