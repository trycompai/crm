# Batch Email Examples

## Table of Contents

- [Pre-send Validation](#pre-send-validation)
- [Error Handling](#error-handling)
- [Retry Logic with Idempotency](#retry-logic-with-idempotency)
- [Chunking Large Batches](#chunking-large-batches)
- [Production-Ready Implementations](#production-ready-implementations)

## Pre-send Validation

Since the entire batch fails if any email has invalid data, validate before sending.

### Node.js

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface BatchEmail {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
}

interface ValidationResult {
  valid: boolean;
  errors: { index: number; field: string; message: string }[];
}

function validateBatch(emails: BatchEmail[]): ValidationResult {
  const errors: ValidationResult['errors'] = [];

  if (emails.length === 0) {
    return { valid: false, errors: [{ index: -1, field: 'batch', message: 'Batch cannot be empty' }] };
  }

  if (emails.length > 100) {
    return { valid: false, errors: [{ index: -1, field: 'batch', message: 'Batch cannot exceed 100 emails' }] };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  emails.forEach((email, index) => {
    if (!email.from) {
      errors.push({ index, field: 'from', message: 'From address is required' });
    }

    if (!email.to || email.to.length === 0) {
      errors.push({ index, field: 'to', message: 'At least one recipient is required' });
    } else if (email.to.length > 50) {
      errors.push({ index, field: 'to', message: 'Cannot exceed 50 recipients per email' });
    } else {
      email.to.forEach((recipient, rIndex) => {
        if (!emailRegex.test(recipient)) {
          errors.push({ index, field: `to[${rIndex}]`, message: `Invalid email: ${recipient}` });
        }
      });
    }

    if (!email.subject) {
      errors.push({ index, field: 'subject', message: 'Subject is required' });
    }

    if (!email.html && !email.text) {
      errors.push({ index, field: 'content', message: 'Either html or text content is required' });
    }
  });

  return { valid: errors.length === 0, errors };
}

// Usage
const emails = [
  { from: 'Acme <noreply@acme.com>', to: ['delivered@resend.dev'], subject: 'Hello', html: '<p>Hi</p>' },
];

const validation = validateBatch(emails);
if (!validation.valid) {
  console.error('Validation failed:', validation.errors);
  return;
}

const { data, error } = await resend.batch.send(emails);
```

### Python

```python
import resend
import re
import os
from dataclasses import dataclass
from typing import List, Optional

resend.api_key = os.environ["RESEND_API_KEY"]

@dataclass
class ValidationError:
    index: int
    field: str
    message: str

def validate_batch(emails: List[dict]) -> tuple[bool, List[ValidationError]]:
    errors = []
    email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

    if not emails:
        return False, [ValidationError(-1, 'batch', 'Batch cannot be empty')]

    if len(emails) > 100:
        return False, [ValidationError(-1, 'batch', 'Batch cannot exceed 100 emails')]

    for index, email in enumerate(emails):
        if not email.get('from'):
            errors.append(ValidationError(index, 'from', 'From address is required'))

        to_list = email.get('to', [])
        if not to_list:
            errors.append(ValidationError(index, 'to', 'At least one recipient is required'))
        elif len(to_list) > 50:
            errors.append(ValidationError(index, 'to', 'Cannot exceed 50 recipients per email'))
        else:
            for r_index, recipient in enumerate(to_list):
                if not email_regex.match(recipient):
                    errors.append(ValidationError(index, f'to[{r_index}]', f'Invalid email: {recipient}'))

        if not email.get('subject'):
            errors.append(ValidationError(index, 'subject', 'Subject is required'))

        if not email.get('html') and not email.get('text'):
            errors.append(ValidationError(index, 'content', 'Either html or text content is required'))

    return len(errors) == 0, errors

# Usage
emails = [
    {"from": "Acme <noreply@acme.com>", "to": ["delivered@resend.dev"], "subject": "Hello", "html": "<p>Hi</p>"},
]

valid, errors = validate_batch(emails)
if not valid:
    print(f"Validation failed: {errors}")
else:
    result = resend.Batch.send(emails)
```

## Error Handling

### Common Error Codes

| Code | Description | Action |
|------|-------------|--------|
| 400 | Bad request (invalid params) | Fix request parameters, don't retry |
| 401 | Invalid API key | Check RESEND_API_KEY, don't retry |
| 403 | Domain not verified | Verify domain at resend.com/domains |
| 409 | Idempotency conflict | Same key with different payload |
| 422 | Unprocessable entity | Check email format/content, don't retry |
| 429 | Rate limited | Retry with exponential backoff |
| 500 | Server error | Retry with exponential backoff |

### Node.js

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.batch.send(emails);

if (error) {
  switch (error.name) {
    case 'validation_error':
      // Invalid parameters - don't retry, fix the data
      console.error('Validation error:', error.message);
      throw new Error(`Invalid batch data: ${error.message}`);

    case 'rate_limit_exceeded':
      // Rate limited - safe to retry with backoff
      console.log('Rate limited, should retry with backoff');
      break;

    case 'api_error':
      // Server error - safe to retry
      console.log('Server error, should retry');
      break;

    default:
      console.error('Unexpected error:', error);
  }
  return;
}

console.log('Batch sent successfully:', data);
```

### Python

```python
import resend
import os

resend.api_key = os.environ["RESEND_API_KEY"]

try:
    result = resend.Batch.send(emails)
    print(f"Batch sent: {result}")
except resend.exceptions.ValidationError as e:
    # Invalid parameters - don't retry
    print(f"Validation error (don't retry): {e}")
    raise
except resend.exceptions.RateLimitError as e:
    # Rate limited - retry with backoff
    print(f"Rate limited (retry with backoff): {e}")
except resend.exceptions.ResendError as e:
    # Other API error - may retry
    print(f"API error: {e}")
```

## Retry Logic with Idempotency

Combine retry logic with idempotency keys to safely retry failed batches.

### Node.js

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface BatchSendOptions {
  maxRetries?: number;
  idempotencyKey: string;
}

async function sendBatchWithRetry(
  emails: Parameters<typeof resend.batch.send>[0],
  options: BatchSendOptions
) {
  const { maxRetries = 3, idempotencyKey } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await resend.batch.send(emails, {
      idempotencyKey,
    });

    if (!error) {
      return { success: true, data };
    }

    // Don't retry validation errors
    if (error.name === 'validation_error') {
      return { success: false, error: error.message, retryable: false };
    }

    // Don't retry idempotency conflicts
    if (error.name === 'idempotency_error') {
      return { success: false, error: 'Duplicate request with different payload', retryable: false };
    }

    // Last attempt failed
    if (attempt === maxRetries) {
      return { success: false, error: error.message, retryable: true };
    }

    // Exponential backoff: 1s, 2s, 4s...
    const delay = Math.pow(2, attempt) * 1000;
    console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return { success: false, error: 'Max retries exceeded', retryable: true };
}

// Usage
const result = await sendBatchWithRetry(
  [
    { from: 'Acme <noreply@acme.com>', to: ['delivered@resend.dev'], subject: 'Hello', html: '<p>Hi</p>' },
    { from: 'Acme <noreply@acme.com>', to: ['delivered@resend.dev'], subject: 'Hello', html: '<p>Hi</p>' },
  ],
  { idempotencyKey: `batch-welcome/${batchId}` }
);

if (result.success) {
  console.log('Batch sent:', result.data);
} else {
  console.error('Batch failed:', result.error);
}
```

### Python

```python
import resend
import os
import time
from dataclasses import dataclass
from typing import Optional, List

resend.api_key = os.environ["RESEND_API_KEY"]

@dataclass
class BatchResult:
    success: bool
    data: Optional[List[dict]] = None
    error: Optional[str] = None
    retryable: bool = False

def send_batch_with_retry(
    emails: List[dict],
    idempotency_key: str,
    max_retries: int = 3
) -> BatchResult:
    for attempt in range(max_retries + 1):
        try:
            result = resend.Batch.send(emails, idempotency_key=idempotency_key)
            return BatchResult(success=True, data=result)
        except resend.exceptions.ValidationError as e:
            # Don't retry validation errors
            return BatchResult(success=False, error=str(e), retryable=False)
        except resend.exceptions.ResendError as e:
            if attempt == max_retries:
                return BatchResult(success=False, error=str(e), retryable=True)

            # Exponential backoff: 1s, 2s, 4s...
            delay = 2 ** attempt
            print(f"Attempt {attempt + 1} failed, retrying in {delay}s...")
            time.sleep(delay)

    return BatchResult(success=False, error="Max retries exceeded", retryable=True)

# Usage
result = send_batch_with_retry(
    emails=[
        {"from": "Acme <noreply@acme.com>", "to": ["delivered@resend.dev"], "subject": "Hello", "html": "<p>Hi</p>"},
        {"from": "Acme <noreply@acme.com>", "to": ["delivered@resend.dev"], "subject": "Hello", "html": "<p>Hi</p>"},
    ],
    idempotency_key=f"batch-welcome/{batch_id}"
)

if result.success:
    print(f"Batch sent: {result.data}")
else:
    print(f"Batch failed: {result.error}")
```

## Chunking Large Batches

For sends larger than 100 emails, chunk into multiple batch requests.

### Node.js

```typescript
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

const BATCH_SIZE = 100;

interface Email {
  from: string;
  to: string[];
  subject: string;
  html: string;
}

async function sendLargeBatch(emails: Email[], batchPrefix: string) {
  const chunks: Email[][] = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    chunks.push(emails.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunk, index) => {
      const idempotencyKey = `${batchPrefix}/chunk-${index}`;

      const { data, error } = await resend.batch.send(chunk, { idempotencyKey });

      return {
        chunkIndex: index,
        success: !error,
        data,
        error: error?.message,
      };
    })
  );

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  return {
    totalChunks: chunks.length,
    successful: successful.length,
    failed: failed.length,
    results,
  };
}

// Usage: Send 250 emails
const emails = generateEmails(250); // Your email generation logic
const result = await sendLargeBatch(emails, `campaign-${randomUUID()}`);

console.log(`Sent ${result.successful}/${result.totalChunks} chunks successfully`);
```

### Python

```python
import resend
import os
import uuid
from typing import List
from concurrent.futures import ThreadPoolExecutor, as_completed

resend.api_key = os.environ["RESEND_API_KEY"]

BATCH_SIZE = 100

def chunk_list(lst: List, size: int) -> List[List]:
    return [lst[i:i + size] for i in range(0, len(lst), size)]

def send_chunk(chunk: List[dict], idempotency_key: str) -> dict:
    try:
        result = resend.Batch.send(chunk, idempotency_key=idempotency_key)
        return {"success": True, "data": result}
    except Exception as e:
        return {"success": False, "error": str(e)}

def send_large_batch(emails: List[dict], batch_prefix: str) -> dict:
    chunks = chunk_list(emails, BATCH_SIZE)
    results = []

    # Send chunks in parallel (adjust max_workers as needed)
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {
            executor.submit(
                send_chunk,
                chunk,
                f"{batch_prefix}/chunk-{index}"
            ): index
            for index, chunk in enumerate(chunks)
        }

        for future in as_completed(futures):
            index = futures[future]
            result = future.result()
            result["chunk_index"] = index
            results.append(result)

    successful = [r for r in results if r["success"]]
    failed = [r for r in results if not r["success"]]

    return {
        "total_chunks": len(chunks),
        "successful": len(successful),
        "failed": len(failed),
        "results": results,
    }

# Usage: Send 250 emails
emails = generate_emails(250)  # Your email generation logic
result = send_large_batch(emails, f"campaign-{uuid.uuid4()}")

print(f"Sent {result['successful']}/{result['total_chunks']} chunks successfully")
```

## Production-Ready Implementations

### Node.js - Complete Batch Email Service

```typescript
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

interface BatchEmail {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  tags?: { name: string; value: string }[];
}

interface BatchSendOptions {
  idempotencyKey?: string;
  maxRetries?: number;
  validateBeforeSend?: boolean;
}

interface BatchResult {
  success: boolean;
  data?: { id: string }[];
  error?: string;
  retryable: boolean;
  validationErrors?: { index: number; field: string; message: string }[];
}

class BatchEmailService {
  private maxBatchSize = 100;
  private maxRecipientsPerEmail = 50;

  validate(emails: BatchEmail[]): { valid: boolean; errors: BatchResult['validationErrors'] } {
    const errors: NonNullable<BatchResult['validationErrors']> = [];
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (emails.length === 0) {
      errors.push({ index: -1, field: 'batch', message: 'Batch cannot be empty' });
      return { valid: false, errors };
    }

    if (emails.length > this.maxBatchSize) {
      errors.push({ index: -1, field: 'batch', message: `Batch cannot exceed ${this.maxBatchSize} emails` });
      return { valid: false, errors };
    }

    emails.forEach((email, index) => {
      if (!email.from) {
        errors.push({ index, field: 'from', message: 'From address is required' });
      }

      if (!email.to?.length) {
        errors.push({ index, field: 'to', message: 'At least one recipient is required' });
      } else if (email.to.length > this.maxRecipientsPerEmail) {
        errors.push({ index, field: 'to', message: `Cannot exceed ${this.maxRecipientsPerEmail} recipients` });
      } else {
        email.to.forEach((r, i) => {
          if (!emailRegex.test(r)) {
            errors.push({ index, field: `to[${i}]`, message: `Invalid email: ${r}` });
          }
        });
      }

      if (!email.subject) {
        errors.push({ index, field: 'subject', message: 'Subject is required' });
      }

      if (!email.html && !email.text) {
        errors.push({ index, field: 'content', message: 'Either html or text is required' });
      }
    });

    return { valid: errors.length === 0, errors };
  }

  async send(emails: BatchEmail[], options: BatchSendOptions = {}): Promise<BatchResult> {
    const {
      idempotencyKey = `batch-${randomUUID()}`,
      maxRetries = 3,
      validateBeforeSend = true,
    } = options;

    // Validate first
    if (validateBeforeSend) {
      const validation = this.validate(emails);
      if (!validation.valid) {
        return {
          success: false,
          error: 'Validation failed',
          retryable: false,
          validationErrors: validation.errors,
        };
      }
    }

    // Send with retry
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const { data, error } = await resend.batch.send(emails, { idempotencyKey });

      if (!error) {
        return { success: true, data, retryable: false };
      }

      // Non-retryable errors
      if (error.name === 'validation_error' || error.name === 'not_found') {
        return { success: false, error: error.message, retryable: false };
      }

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(r => setTimeout(r, delay));
      }
    }

    return { success: false, error: 'Max retries exceeded', retryable: true };
  }

  async sendLarge(emails: BatchEmail[], batchPrefix: string): Promise<{
    totalEmails: number;
    totalChunks: number;
    successfulChunks: number;
    failedChunks: number;
    sentEmailIds: string[];
    errors: { chunkIndex: number; error: string }[];
  }> {
    const chunks: BatchEmail[][] = [];
    for (let i = 0; i < emails.length; i += this.maxBatchSize) {
      chunks.push(emails.slice(i, i + this.maxBatchSize));
    }

    const results = await Promise.all(
      chunks.map((chunk, index) =>
        this.send(chunk, { idempotencyKey: `${batchPrefix}/chunk-${index}` })
          .then(result => ({ chunkIndex: index, ...result }))
      )
    );

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      totalEmails: emails.length,
      totalChunks: chunks.length,
      successfulChunks: successful.length,
      failedChunks: failed.length,
      sentEmailIds: successful.flatMap(r => r.data?.map(d => d.id) || []),
      errors: failed.map(r => ({ chunkIndex: r.chunkIndex, error: r.error || 'Unknown error' })),
    };
  }
}

// Usage
const batchService = new BatchEmailService();

// Simple batch
const result = await batchService.send([
  { from: 'Acme <noreply@acme.com>', to: ['delivered@resend.dev'], subject: 'Hello', html: '<p>Hi</p>' },
  { from: 'Acme <noreply@acme.com>', to: ['delivered@resend.dev'], subject: 'Hello', html: '<p>Hi</p>' },
], { idempotencyKey: `welcome-batch/${batchId}` });

// Large batch (auto-chunked)
const largeResult = await batchService.sendLarge(emails, `campaign-${campaignId}`);
```

### Python - Complete Batch Email Service

```python
import resend
import os
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

resend.api_key = os.environ["RESEND_API_KEY"]

@dataclass
class ValidationError:
    index: int
    field: str
    message: str

@dataclass
class BatchResult:
    success: bool
    data: Optional[List[dict]] = None
    error: Optional[str] = None
    retryable: bool = False
    validation_errors: List[ValidationError] = field(default_factory=list)

@dataclass
class LargeBatchResult:
    total_emails: int
    total_chunks: int
    successful_chunks: int
    failed_chunks: int
    sent_email_ids: List[str]
    errors: List[dict]

class BatchEmailService:
    MAX_BATCH_SIZE = 100
    MAX_RECIPIENTS_PER_EMAIL = 50

    def __init__(self):
        self.email_regex = re.compile(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')

    def validate(self, emails: List[dict]) -> tuple[bool, List[ValidationError]]:
        errors = []

        if not emails:
            errors.append(ValidationError(-1, 'batch', 'Batch cannot be empty'))
            return False, errors

        if len(emails) > self.MAX_BATCH_SIZE:
            errors.append(ValidationError(-1, 'batch', f'Batch cannot exceed {self.MAX_BATCH_SIZE} emails'))
            return False, errors

        for index, email in enumerate(emails):
            if not email.get('from'):
                errors.append(ValidationError(index, 'from', 'From address is required'))

            to_list = email.get('to', [])
            if not to_list:
                errors.append(ValidationError(index, 'to', 'At least one recipient is required'))
            elif len(to_list) > self.MAX_RECIPIENTS_PER_EMAIL:
                errors.append(ValidationError(index, 'to', f'Cannot exceed {self.MAX_RECIPIENTS_PER_EMAIL} recipients'))
            else:
                for r_idx, recipient in enumerate(to_list):
                    if not self.email_regex.match(recipient):
                        errors.append(ValidationError(index, f'to[{r_idx}]', f'Invalid email: {recipient}'))

            if not email.get('subject'):
                errors.append(ValidationError(index, 'subject', 'Subject is required'))

            if not email.get('html') and not email.get('text'):
                errors.append(ValidationError(index, 'content', 'Either html or text is required'))

        return len(errors) == 0, errors

    def send(
        self,
        emails: List[dict],
        idempotency_key: Optional[str] = None,
        max_retries: int = 3,
        validate_before_send: bool = True
    ) -> BatchResult:
        idempotency_key = idempotency_key or f"batch-{uuid.uuid4()}"

        # Validate first
        if validate_before_send:
            valid, errors = self.validate(emails)
            if not valid:
                return BatchResult(
                    success=False,
                    error='Validation failed',
                    retryable=False,
                    validation_errors=errors
                )

        # Send with retry
        for attempt in range(max_retries + 1):
            try:
                result = resend.Batch.send(emails, idempotency_key=idempotency_key)
                return BatchResult(success=True, data=result)
            except resend.exceptions.ValidationError as e:
                return BatchResult(success=False, error=str(e), retryable=False)
            except resend.exceptions.ResendError as e:
                if attempt < max_retries:
                    time.sleep(2 ** attempt)
                else:
                    return BatchResult(success=False, error=str(e), retryable=True)

        return BatchResult(success=False, error='Max retries exceeded', retryable=True)

    def send_large(self, emails: List[dict], batch_prefix: str, max_workers: int = 5) -> LargeBatchResult:
        chunks = [emails[i:i + self.MAX_BATCH_SIZE] for i in range(0, len(emails), self.MAX_BATCH_SIZE)]
        results = []

        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = {
                executor.submit(
                    self.send,
                    chunk,
                    f"{batch_prefix}/chunk-{idx}"
                ): idx
                for idx, chunk in enumerate(chunks)
            }

            for future in as_completed(futures):
                idx = futures[future]
                result = future.result()
                results.append({"chunk_index": idx, "result": result})

        successful = [r for r in results if r["result"].success]
        failed = [r for r in results if not r["result"].success]

        return LargeBatchResult(
            total_emails=len(emails),
            total_chunks=len(chunks),
            successful_chunks=len(successful),
            failed_chunks=len(failed),
            sent_email_ids=[
                item["id"]
                for r in successful
                if r["result"].data
                for item in r["result"].data
            ],
            errors=[
                {"chunk_index": r["chunk_index"], "error": r["result"].error}
                for r in failed
            ]
        )

# Usage
service = BatchEmailService()

# Simple batch
result = service.send([
    {"from": "Acme <noreply@acme.com>", "to": ["delivered@resend.dev"], "subject": "Hello", "html": "<p>Hi</p>"},
    {"from": "Acme <noreply@acme.com>", "to": ["delivered@resend.dev"], "subject": "Hello", "html": "<p>Hi</p>"},
], idempotency_key=f"welcome-batch/{batch_id}")

# Large batch (auto-chunked)
large_result = service.send_large(emails, f"campaign-{campaign_id}")
```
