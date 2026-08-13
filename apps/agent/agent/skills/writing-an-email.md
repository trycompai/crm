---
description: Use before writing any email body — the exact block document shape that write_template, write_campaign_graph and write_shell accept, every block type, and what the linter refuses.
---

# Writing an email

Every email body in this CRM is one JSON document. `write_template`,
`write_campaign_graph` (on an `EMAIL` node) and `write_shell` all take the same
shape. Copy it from here rather than guessing — a wrong shape is refused and
saves nothing.

## The document

```json
{ "version": 1, "blocks": [] }
```

`version` is always `1`. `blocks` is an array, at most 60 long.

## Every text field is an array of runs

This is the one thing that is not guessable. A "text" field is **never a
string**. It is an array of inline runs:

```json
"text": [{ "text": "Hi " }, { "text": "Dana", "bold": true }, { "text": "," }]
```

A run carries `text`, and optionally `bold`, `italic` and `href`. The simplest
possible run is `[{ "text": "Hello" }]`.

## Every block

```json
{ "type": "heading", "level": 1, "text": [{ "text": "Continuous monitoring is here" }] }
{ "type": "text", "text": [{ "text": "Hi {{contact.firstName|there}} — welcome aboard." }] }
{ "type": "button", "label": "Book your kickoff", "href": "https://example.com/kickoff" }
{ "type": "image", "src": "https://example.com/shot.png", "alt": "The evidence view", "width": 560 }
{ "type": "quote", "text": [{ "text": "It took an afternoon, not a quarter." }] }
{ "type": "divider" }
{ "type": "spacer", "size": "md" }
```

- `heading.level` is `1`, `2` or `3`. Nothing else.
- `button.href` and `image.src` must be real absolute URLs. `https://` alone is
  not one, and a document containing it is refused whole.
- `image.alt` is required. `image.width` is 16 to 1200.
- `spacer.size` is `"sm"`, `"md"` or `"lg"`.
- `divider` and `spacer` carry no text.

There is no `id` field on a block, no `data` wrapper, no `content` field, and
no `paragraph` type. Blocks are positional.

## Merge tags

Write them inside a run's text: `{{contact.firstName|there}}`. The part after
the pipe is the fallback and it is not optional in practice — a tag with no
fallback renders empty for anybody missing that field. Nine tags resolve, and
no others: `contact.firstName`, `contact.lastName`, `contact.email`,
`contact.title`, `company.name`, `company.domain`, `workspace.name`,
`sender.name` and `sender.email`.

## What the compiler adds, and you cannot

- **The brand line** — the logo, or the workspace name in bold — sits above
  every body.
- **The postal address and the unsubscribe link** sit below it.

None of the three is a block. Never write a logo block at the top of a body and
never write a second unsubscribe link. `read_shell` reports which brand line
applies.

## What the linter refuses

- A subject that is empty, or over 150 characters.
- A body with no blocks.
- A button with no label or no valid `href`.
- An image with no `alt`.
- A merge tag that is not one of the known ones.

It warns about a subject over 50 characters, and about a missing preheader.

## When a write is refused

The tool returns `problems` — read them rather than guessing again. A body the
tool cannot read at all is refused before the linter: each problem is a `path`
and a `message`, and `shapes` comes back with them, which is this vocabulary. A
body it can read and the linter refuses comes back with a `code`, a `message`
and the `blockIndex` the problem applies to. One corrected call is the
expectation, not ten probes.

## After a write is accepted

Call `review_email` on what you saved. The linter checks structure, not looks —
a valid document can still open on a wall of image. The review renders the real
email at desktop and mobile width and reports what a reader sees first.
