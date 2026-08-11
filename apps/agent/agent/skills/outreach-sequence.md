---
name: outreach-sequence
description: Compose a human-reviewed three-step Lode outreach sequence for a perfectly qualified prospect using its fixed A/B/C experiment assignment.
---

# Outreach sequence

1. Call `read_outreach_assignment` for the dispatched prospect.
2. Use only retained CRM evidence. Never invent familiarity, a job detail, a person detail or a result.
3. Follow the assigned experiment angle exactly:
   - A: observed job-day pain
   - B: current official hiring or growth signal
   - C: fragmented tools versus one practical operating brain
4. Write three steps:
   - Step 1: under 90 words, one low-friction question.
   - Step 2: under 70 words, add one useful operational observation rather than repeating step 1.
   - Step 3: under 60 words, polite close-the-loop message.
5. Use plain landscaper and operator language. Avoid SaaS, transformation, workflow orchestration and generic AI language.
6. Keep the subject specific and natural. Do not use fake reply prefixes, urgency, clickbait or tracking claims.
7. Call `record_outreach_sequence` exactly once with steps 1, 2 and 3.
8. The tool stores proposals for Richard or Angus to edit and approve. Never approve or send them.
