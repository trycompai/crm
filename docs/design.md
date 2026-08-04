# Design — Rules for AI Agents

The `/prospecting` workspace uses the same page shell, data-table controls,
cards, dialogs and responsive navigation as the CRM directories. Product
activation schedules research; commercial readiness separately unlocks message
approval. Candidate approval and message approval remain visibly distinct. See
[product prospecting](./prospecting.md).

- /packages/ui is the single source of truth for all UI.
- Always use shared shadcn components from /packages/ui.
- Do not override component styles with className.
- Do not introduce custom border radii, spacing, colours, shadows, or other visual deviations.
- Corners are rounded, from the scale only: `rounded-sm` (4px) for the smallest
  controls, `rounded-md` (5px) for buttons, inputs and segments, `rounded-lg`
  (8px) for surfaces that contain controls — popovers, dialogs, menus, table
  shells. Never a literal radius at the call site.
- `rounded-none` is still correct in one case: an element that must join its
  neighbour edge to edge. The input inside an input group, the middle cells of
  a selected date range, and the drawer handle are the existing examples.
- If a component needs a new variant or style, implement it in /packages/ui so the entire application stays consistent.

## Colour

Flat white, neutral greys, and one brand green (`#006B4F`). The greys are
untinted on purpose: there is no scene to tint them toward, and a tinted grey
without a reason reads as indecision.

**Only two things are filled**: `primary` for the action you want, `destructive`
for the one you cannot undo. Everything else — secondary, outline, ghost — is a
white chip in light and a dark chip in dark. That is what keeps a rep's eye
landing on *go* or *stop* and skimming past the rest.

`--primary` and `--destructive` hold the **same value in both themes**. A brand
colour that changes per theme is not one colour, it is two, and both then need
maintaining. The single exception is `--ring`, which lightens in dark: a fill
carries the brand, but a ring only has to be seen, and `#006B4F` is too close to
the dark background to register.
