# Triage Labels

The skills speak in five canonical triage roles. This file maps each role to the
label string used in this repo's tracker, which is **Linear, team CRM**.

| Label in mattpocock/skills | Label in our tracker | Meaning |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill names a role — "apply the AFK-ready triage label" — use the string
from the right-hand column.

## None of these exist in Linear yet

Team CRM currently has `PRD`, `Customer Billing`, `Compliance`, `Document`,
`Featurebase`, `Bug`, `Feature` and `Improvement`. Those describe what an issue
*is*; the five above describe what it is *waiting on*, so they sit alongside
rather than replacing anything. Nothing collides.

Create one with `create_issue_label`, then apply it with `save_issue` and
`addLabels`, which takes names and is append-only — it never removes a label an
issue already carries. Use `labels` only to replace the whole set deliberately.

## `wontfix` duplicates a workflow state

Team CRM has no `Triage` state, so `needs-triage` has no equivalent and the label
is the only signal. But the team does have `Canceled` and `Duplicate` states.

**Prefer the state.** An issue that will not be actioned belongs in `Canceled`,
and a repeat belongs in `Duplicate` with `duplicateOf` set. Reach for the
`wontfix` label only when a skill needs the label specifically and the issue must
stay open.
