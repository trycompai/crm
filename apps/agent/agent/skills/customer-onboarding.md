---
name: customer-onboarding
description: Turn a closed-won Lode deal into a practical customer discovery plan covering current systems, structured and unstructured data, secure access, ingestion and Lode Brain readiness.
---

# Customer onboarding

1. Call `read_deal_history` for the dispatched deal. Use email, meeting and Granola history only where it is clearly about this company.
2. Separate three things throughout: confirmed customer facts, reasonable inference, and questions that still need an answer.
3. Cover the operating estate, not just software:
   - estimating, CRM, job/project management and scheduling
   - documents, drawings, photos, forms, spreadsheets and shared drives
   - accounting, supplier, client and subcontractor information
   - messaging, email, call notes and field knowledge
   - identities, owners, permissions, retention and sensitive data boundaries
4. Never claim that Lode has access. Record access as a question or dependency until it is explicitly confirmed.
5. Prioritise the smallest useful first ingestion and the business outcome it proves.
6. Do not import or expose unrelated personal notes.
7. Call `record_customer_onboarding_plan` exactly once with concise summaries and actionable items.
