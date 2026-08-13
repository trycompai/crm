---
description: Use when creating a marketing email template, or filling in an empty one — what a good template contains, subject and preheader conventions, every merge tag that resolves, and what the shell already provides so the body must not.
---

# Creating a template

A template is a saved email a campaign starts from. `write_template` saves it —
name, subject, preheader and body in one call. **Read `writing-an-email` before
you write the body**: every text field is an array of runs, not a string, and a
wrong shape is refused and saves nothing.

## Ask what it is for before you write it

A fresh template is called "Untitled template" and holds nothing. Three answers
shape everything else: who receives it, what one thing it says, and what the
reader should click. If the rep has not said, ask once, in one message — then
write the whole template rather than a fragment.

Name it for what it is — *Welcome — new signups*, *Follow-up after a demo* —
never *Untitled template* or *Email 1*. The name is how a rep finds it in a
list of forty.

## The subject and the preheader

- The subject says what the email says. *"Your kickoff is booked"* beats
  *"Newsletter #4"* and any subject with "exciting" in it.
- Under 50 characters survives the cut on most phones. The linter warns past
  50 and refuses past 150.
- Always write a preheader. It is the line the inbox shows after the subject;
  without one, the inbox shows the first line of the body instead. Do not
  repeat the subject in it — the reader sees both side by side.

## One idea, one thing to click

One idea per email, and one call to action — a single button with a label that
says what happens, *"Book your kickoff"*, not *"Click here"*. A second ask
halves the first. The linter warns when there is nothing to click at all and
when there are more than fifteen links, because spam filters count them.

## Length

Two or three short paragraphs. The second half of a long email is not read,
and Gmail clips a long one entirely. Lead with the reader — *"You had a look
at pricing"* beats *"We are excited to announce"*.

## Merge tags

Write them inside a run's text: `{{contact.firstName|there}}`. The part after
the pipe is the fallback. Nine tags resolve, and no others:

| Always has a value | Often empty — always give a fallback |
| --- | --- |
| `contact.email` | `contact.firstName`, `contact.lastName`, `contact.title` |
| `workspace.name` | `company.name`, `company.domain` |
| `sender.email` | `sender.name` |

A tag from the right column without a fallback renders *Hi ,* for anybody
missing that field, and the linter warns about it. An unknown tag is refused.

## What the shell already provides, so the body must not

The compiler wraps every send:

- **The brand line** — the logo, or the workspace name — sits above the body.
- **The postal address and the unsubscribe link** sit below it.

Never write a logo block at the top, a signature footer at the bottom, a
postal address or a second unsubscribe link. Each one would appear twice on
every send. `read_shell` reports which brand line applies.

## Before you save

`write_template` lints first and refuses errors back as `problems`, each with
a `code`, a `message` and the `blockIndex` it applies to — fix them and call
again. A body it cannot read at all is refused before the linter, and those
`problems` carry a `path` and a `message` instead, plus `shapes`: the whole
block vocabulary. When updating, pass the existing `templateId`; leaving it
out creates a second template and the rep keeps looking at the old one.
