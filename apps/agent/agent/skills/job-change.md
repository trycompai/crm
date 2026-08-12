---
name: job-change
description: Use when a contact's employer fact changes, or on a recheck pass that compares current role to what the CRM already holds — how to raise the signal without overwriting human data.
---

# Job changes

A champion who moves company is the highest-intent people signal in B2B sales.
Detection is not a separate pipeline. A new applied `employer` fact that
supersedes the previous one *is* the event.

## Detect

1. Read the contact (`read_crm_history`) and what you already recorded.
2. Re-read their public profile or work history on the recheck cadence.
3. If the current employer differs from the applied fact, call `record_fact`
   with field `employer` and the evidence you observed.
4. When that fact applies and supersedes a previous employer, call
   `record_job_change` with the contact id only.

Do not invent a move from a weak page. No employer change on the facts means
`record_job_change` refuses. That is correct.

## Raise, do not re-parent unattended

`record_job_change` always:

- writes a timeline note on the contact
- creates an owner TASK when the contact has an owner

It does **not** move the contact to another company unless you pass
`moveToCompanyId`. That argument is approval-gated for a person and **denied**
on automated sessions. Unattended runs omit it. The owner decides whether the
CRM company link changes.

Never overwrite a field a person typed. Facts already refuse human-owned
columns; company re-parent is the extra gate on this tool.

## Recheck cadences

Use `schedule_recheck` with a reason a rep can read:

| Situation | Days | Reason shape |
| --- | ---: | --- |
| Champion on an open deal | 14 | "a job change here would move the Acme deal" |
| Named contact, no open deal | 90 | "named contact at Fernhill, worth a quiet recheck" |
| Steady job-change feed | 30 | "baseline re-read so an employer move is not missed" |
| Nothing found twice | 365 | "two empty lookups; park until next year" |
| Support / no-reply alias | — | do not schedule |

Pick the shortest interval that matches the contact's deal weight. A live
champion beats a baseline feed.

## After the raise

Schedule the next recheck if the contact still matters. The note and task are
the product; do not email anyone and do not invent a replacement contact.
