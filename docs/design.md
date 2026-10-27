# Design — Rules for AI Agents

The design source is Comp Neo (`comp-neo/packages/ui`): its tokens, density,
geometry and motion, ported onto CRM's Radix components. Match Neo when a rule
here is silent.

## Ownership

- `/packages/ui` is the single source of truth for all UI. Use its shared
  components; a new variant or style is implemented there, never at the call
  site.
- Use semantic tokens and the scale only: no literal colours, radii, spacing or
  shadows at the call site, and no `className` that restyles a shared component.
- Port Neo by class string onto the existing Radix API. Neo runs on Base UI;
  CRM stays on Radix. Radix state reaches Tailwind through the `data-open`,
  `data-checked`, `data-active` and related variants in `globals.css`, which
  match `data-state`.

## Colour

Neutral greys, alpha edges, and one emerald accent.

- `primary` is monochrome: near-black in light, near-white in dark. It is the
  one filled action. `destructive-solid` fills the one action you cannot undo.
  Everything else is outline, ghost or secondary.
- `brand` (emerald) is the accent, never a fill for buttons: focus ring, caret,
  selection, switches, progress, success.
- Edges are translucent (`border`, `input`) so they read on any surface. A
  surface draws its edge with `shadow-border`, a menu with `shadow-menu`, a
  dialog with `shadow-modal`, focus with `shadow-focus`.
- Status: `status-info`, `status-warning`, `status-success`, `status-danger`.
  Words in a status colour use the `-text` token. `success`, `warning` and
  `info` are aliases of these; `severity-*`, `code-*` and `tag` stay CRM
  tokens.

## Density and geometry

- Controls are 36px (`h-9`) with 14px text; `sm` is 32px. Secondary lines,
  hints, table headers and meta are `text-13`.
- Radii from the scale only: `rounded-sm` 4px, `rounded-md` 6px for controls,
  `rounded-lg` 8px, `rounded-xl` 12px for menus and dialogs. `rounded-none`
  only joins an element to its neighbour edge to edge.

## Charts

Charts use EvilCharts' Apache ECharts provider from `packages/ui/src/components/evilcharts`.
Shared dashboard chart wrappers own presentation and formatting.
Keep server amounts in reporting-currency cents and preserve missing-data states.
Use theme-aware colors and the same mapping across charts, legends, and tooltips.
Canvas is the default renderer. SVG is an explicit chart option.
Canvas charts expose their values through accessible summaries.
Respect reduced motion and dynamic resizing.

Dashboard chart groups keep a keyboard tab stop for reading values and activating chart items.
They use `role="group"` because a form fieldset does not describe these chart controls.
The scoped Biome override permits these group roles and tab stops only in `dashboard-chart.tsx`.
It keeps every other accessibility rule enabled.

## Motion

- Surfaces open on `ease-spring` and close faster on `ease-out`: menus and
  dialogs 200ms in, 100ms out; sheets 300ms in, 150ms out. Switch thumbs use
  `ease-spring-bouncy`.
- Motion lives in `packages/ui`. Apps never pick durations or easings.
- Reduced motion: everything still changes state, nothing travels. The base
  layer cuts every animation and transition to 1ms and one iteration; JS
  motion reads `useReducedMotion`.

`reduced-motion.css` owns the global accessibility overrides.
Its `!important` declarations beat component utilities, so only this stylesheet permits them in lint.

Sheets use interruptible translate and opacity transitions in `sheet.css`.
Nonvisual presence animations keep Radix mounted through exit.
Preserve both parts: Radix watches animation events to remove the sheet.

## Layout

Separate items with layout, never with glyphs. Inline metadata (a date, an
owner, a count) goes in `MetaRow` from `@crm/ui/components/meta-row`: each
child is its own item and the row wraps. A string that cannot hold layout, such
as a `title` attribute or an option label, joins with a comma.

DataTable keeps its named scroll region in the tab order, including during loading.
Its lint override permits this tab stop for keyboard scrolling.

## Auth exception

`AuthShell` (sign-in, grant access, onboarding) keeps the pre-Neo look exactly.
It carries `dark theme-classic`, which restores the classic dark tokens and the
5px radius. It uses `AuthButton`, `AuthInput`, the `AuthField` and `AuthInputGroup`
parts, and `LogoSpinner`. Keep these frozen components inside `AuthShell`.
