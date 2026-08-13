# Email Accessibility

Emails must be readable by screen readers, dark-mode clients, translation tools, and AI agents — not just sighted readers on a default inbox. The rules below are mechanical. Apply them every time.

## Rules

### Set `lang` and `dir` on `<html>` and on `<body>`'s direct children (Serious)

Both attributes are needed in **two places**: on `<html>` *and* on the direct children of `<body>`. Several email clients strip the attributes from `<html>`, which is why duplicating them on the body's children is the single most common accessibility failure in production email.

```html
<html lang="en" dir="ltr">
  <head>
    <title>Your weekly product updates</title>
  </head>
  <body>
    <div lang="en" dir="ltr">
      <!-- email content -->
    </div>
  </body>
</html>
```

- `lang`: a [BCP 47 language tag](https://developer.mozilla.org/en-US/docs/Glossary/BCP_47_language_tag) (`en`, `pt-BR`, `ja`, `ar`)
- `dir`: `ltr`, `rtl`, or `auto`

**Fallbacks when the correct values aren't available** (use only when you genuinely don't know):

- `dir="auto"` — lets the user agent infer direction from content
- `lang="und"` — marks the language as undetermined

Both fallbacks are worse than the correct value but much better than nothing. For multi-locale templates, pass the locale through; do not hardcode `en`.

### Mark layout tables as presentational (Serious)

Any `<table>` used for layout must have `role="presentation"` (or the equivalent `role="none"`). Otherwise screen readers announce "table, row 1 of N" for every layout row and the email becomes unusable. Prefer avoiding layout tables entirely; when you can't, mark them.

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td>...</td>
  </tr>
</table>
```

Leave a `<table>` without `role="presentation"` only when the data is genuinely tabular (line items, comparison rows). Tabular data should also use `<th scope="col">` for column headers.

### Use a single `<h1>` and nest headings in order (Mild)

Most emails should have one `<h1>` that names the email, with subheadings nested in order:`<h1>` → `<h2>` → `<h3>`. Never skip levels. Never fake a heading with bold `<p>`.

```html
<h1>Order confirmation</h1>
  <h2>Items</h2>
  <h2>Shipping</h2>
    <h3>Address</h3>
    <h3>Tracking</h3>
```

Headings are how assistive tech and AI clients navigate and summarize the email.

**Exception:** very short messages (SMS-style notifications, single-sentence alerts) may not need a heading at all. If the email body is one or two sentences, skip the `<h1>` rather than wrap a heading around the only content.

### Every link must have discernible text (Serious)

Every `<a>` must contain text content that a screen reader can announce. The most common failure is a linked image with no alt text.

A **linked image is never decorative.** It's functional, so its `alt` must describe what clicking does, not just what the image looks like.

```html
<!-- Wrong: linked image with no accessible name -->
<a href="/order/123">
  <img src="view-order.png" alt="">
</a>

<!-- Right: alt describes the action -->
<a href="/order/123">
  <img src="view-order.png" alt="View order #123">
</a>

<!-- Also right: visible text alongside the image -->
<a href="/order/123">
  <img src="icon.png" alt="">
  View order #123
</a>
```

When the visible link text can't carry enough information, add visually hidden text inside the `<a>` (see [goodemailcode.com/email-accessibility/visually-hidden-text](https://www.goodemailcode.com/email-accessibility/visually-hidden-text)). `aria-label` and `title` on `<a>` have limited support in email clients. Prefer real text content or visually hidden text.

### Link text must describe the destination (Moderate)

Even when a link has text, it must describe where the link goes. Never use "click here," "learn more," "read more," or bare URLs. Screen reader users often navigate by jumping between link texts with no surrounding context.

```html
<!-- Wrong -->
<a href="...">click here</a>
<a href="...">https://resend.com/blog/...</a>

<!-- Right -->
<a href="...">Read the 2026 accessibility report</a>
```

### Write meaningful alt text — and use `alt=""` for decorative images (Critical)

Two distinct rules, both mandatory. `alt` must always be present; the value depends on the image's role.

**Meaningful images** (product shots, charts, screenshots, anything carrying information): describe purpose and key details in context.

```html
<!-- Wrong: redundant, vague -->
<img src="..." alt="image">
<img src="..." alt="photo of a bike">

<!-- Right: purpose + key details -->
<img src="..." alt="Red bicycle leaning against a brick wall on a rainy street">
```

**Decorative images** (spacers, dividers, background flourishes, pure branding ornaments): use an empty `alt=""`. This tells screen readers to skip them. Never omit the attribute entirely — omitting it and `alt=""` are not equivalent; some screen readers announce the filename when `alt` is absent.

```html
<img src="divider.png" alt="" role="presentation">
```

If an image conveys no information that isn't already in the surrounding text, it is decorative. If it's inside an `<a>`, it is **not** decorative — see the "Every link must have discernible text" rule.

### Include a `<title>` tag (Serious)

Many clients and assistive technologies read `<title>` before anything else. It's also shown when the email is viewed as a web page. Treat it like the subject line, not the brand name.

```html
<head>
  <title>Your weekly product updates from Resend</title>
</head>
```

If the per-email title is hard to populate, a generic but specific fallback like `"Email from {Brand Name}"` still beats nothing.

### Hit 4.5:1 color contrast, then check dark mode (Serious)

- Body text and links: **4.5:1** minimum against the background (WCAG AA)
- Large text (≥18pt, or ≥14pt bold): **3:1** minimum
- Never rely on color alone to convey meaning (error states, status badges) — pair it with text or an icon

Verify with the [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/) or browser devtools.

**Dark mode.** Outlook, Apple Mail, and others force dark mode and derive dark colors from your light ones. Healthy starting contrast keeps the auto-inverted version readable. Always preview in dark mode before shipping.

## Priority order

When you can't fix everything, fix in this order:

1. **Critical** — missing or misused `alt` on images
2. **Serious** — `lang`/`dir` (on `<html>` and body children), `role="presentation"` on layout tables, links without discernible text, missing `<title>`, color contrast
3. **Moderate** — non-descriptive link text ("click here")
4. **Mild** — missing `<h1>` (skip the fix for very short messages)

## Authoring checklist

Run this on every template:

- [ ] `<html>` has `lang` and `dir`; direct children of `<body>` also have `lang` and `dir`
- [ ] `<title>` set on `<head>`, specific to this email (not the brand name)
- [ ] Layout `<table>` elements have `role="presentation"` (or `role="none"`)
- [ ] At most one `<h1>` (or none, for very short messages); `<h2>`/`<h3>` nested in order
- [ ] Every `<a>` has discernible text — visible text, descriptive alt on linked images, or visually hidden text
- [ ] Every link describes its destination — no "click here," "learn more," or bare URLs
- [ ] Every meaningful image has descriptive `alt`; every decorative image has an explicit `alt=""`
- [ ] No linked image with `alt=""` (linked images are functional, never decorative)
- [ ] Body text passes 4.5:1 contrast and stays readable in dark mode
- [ ] Plain-text alternative is sent alongside the HTML version

## Testing

- **Automated.** Run the email through [Parcel's accessibility checker](https://parcel.io/docs/dev-tools/accessibility-checker) (the same tool the EMC report uses; available on the free plan). It catches most of the rules above.
- **Screen reader pass.** macOS VoiceOver (`Cmd+F5`) or NVDA on Windows. Listen top to bottom; if anything is confusing, fix the markup.
- **Contrast.** [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/).
- **Dark mode.** Send a test to Outlook (Windows/web), Apple Mail with dark appearance, Gmail iOS and Android.

Automated tests do not catch everything. They will not tell you whether alt text actually matches the image, whether headings make semantic sense, or whether text inside an image is readable on narrow viewports. Even the three brands that passed every automated check in the EMC 2026 report had judgment-level issues like generic alt text on decorative images, alt text that didn't match the image, and 10px footer text. Treat automation as a floor, not a ceiling.

## Related

- [Transactional Emails](./transactional-emails.md) — content patterns for password resets, OTPs, receipts
- [Marketing Emails](./marketing-emails.md) — newsletter and campaign best practices
- [Compliance](./compliance.md) — legal requirements that overlap with accessibility (e.g., clear unsubscribe text)

## Tooling

When generating templates with React Email, the latest version handles several of the structural rules: `<Html>` sets `lang`/`dir`, `<Img>` defaults to `alt=""`, `<Markdown>` tables render `role="presentation"`, and `<Preview>` emits a `<title>`. Upgrade with `npm install react-email@latest`. The content rules — heading hierarchy, descriptive alt and link text, contrast, the linked-image rule — still have to be applied by hand.
