---
name: email-best-practices
description: Use when building email features, emails going to spam, high bounce rates, setting up SPF/DKIM/DMARC authentication, implementing email capture, ensuring compliance (CAN-SPAM, GDPR, CASL), handling webhooks, retry logic, making emails accessible (alt text, headings, contrast, screen readers), or deciding transactional vs marketing.
license: MIT
metadata:
  author: Resend
  version: "1.0.2"
  homepage: https://resend.com/agent-skills
  source: https://github.com/resend/email-best-practices
  openclaw:
    links:
      repository: https://github.com/resend/email-best-practices
      documentation: https://resend.com/docs/email-best-practices-skill
---

# Email Best Practices

Guidance for building deliverable, compliant, user-friendly emails.

## Architecture Overview

```
[User] → [Email Form] → [Validation] → [Double Opt-In]
                                              ↓
                                    [Consent Recorded]
                                              ↓
[Suppression Check] ←──────────────[Ready to Send]
        ↓
[Idempotent Send + Retry] ──────→ [Email API]
                                       ↓
                              [Webhook Events]
                                       ↓
              ┌────────┬────────┬─────────────┐
              ↓        ↓        ↓             ↓
         Delivered  Bounced  Complained  Opened/Clicked
                       ↓        ↓
              [Suppression List Updated]
                       ↓
              [List Hygiene Jobs]
```

## Quick Reference

| Need to... | See |
|------------|-----|
| Set up SPF/DKIM/DMARC, fix spam issues | [Deliverability](./references/deliverability.md) |
| Build password reset, OTP, confirmations | [Transactional Emails](./references/transactional-emails.md) |
| Plan which emails your app needs | [Transactional Email Catalog](./references/transactional-email-catalog.md) |
| Build newsletter signup, validate emails | [Email Capture](./references/email-capture.md) |
| Send newsletters, promotions | [Marketing Emails](./references/marketing-emails.md) |
| Ensure CAN-SPAM/GDPR/CASL compliance | [Compliance](./references/compliance.md) |
| Decide transactional vs marketing | [Email Types](./references/email-types.md) |
| Handle retries, idempotency, errors | [Sending Reliability](./references/sending-reliability.md) |
| Process delivery events, set up webhooks | [Webhooks & Events](./references/webhooks-events.md) |
| Manage bounces, complaints, suppression | [List Management](./references/list-management.md) |
| Make emails accessible (screen readers, alt text, contrast) | [Accessibility](./references/accessibility.md) |

## Start Here

**New app?**
Start with the [Catalog](./references/transactional-email-catalog.md) to plan which emails your app needs (password reset, verification, etc.), then set up [Deliverability](./references/deliverability.md) (DNS authentication) before sending your first email.

**Spam issues?**
Check [Deliverability](./references/deliverability.md) first—authentication problems are the most common cause. Gmail/Yahoo reject unauthenticated emails.

**Marketing emails?**
Follow this path: [Email Capture](./references/email-capture.md) (collect consent) → [Compliance](./references/compliance.md) (legal requirements) → [Marketing Emails](./references/marketing-emails.md) (best practices).

**Production-ready sending?**
Add reliability: [Sending Reliability](./references/sending-reliability.md) (retry + idempotency) → [Webhooks & Events](./references/webhooks-events.md) (track delivery) → [List Management](./references/list-management.md) (handle bounces).

**Accessibility?**
Most emails fail basic accessibility checks. See [Accessibility](./references/accessibility.md) for `lang`/`dir`, presentational tables, headings, alt text, `<title>`, and contrast.
