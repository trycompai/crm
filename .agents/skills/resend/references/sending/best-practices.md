# Best Practices for Sending Emails with Resend

## Table of Contents

- [Idempotency Keys](#idempotency-keys)
- [Error Handling](#error-handling)
- [Retry Logic](#retry-logic)
- [Batch-Specific Practices](#batch-specific-practices)

## Idempotency Keys

Use idempotency keys to prevent duplicate emails when retrying failed requests.

### Key Facts

- **Expiration:** Keys expire after 24 hours
- **Max length:** 256 characters
- **Format:** Use `<event-type>/<entity-id>` pattern for single emails, `batch-<event-type>/<batch-id>` for batch
- **Behavior:** Same key + same payload = returns original response without resending
- **Conflict:** Same key + different payload = returns 409 error

### Examples by Format

| Use Case | Key Format | Example |
|----------|------------|---------|
| Welcome email | `welcome-email/<user-id>` | `welcome-email/user-123` |
| Order confirmation | `order-confirmation/<order-id>` | `order-confirmation/order-456` |
| Password reset | `password-reset/<user-id>/<timestamp>` | `password-reset/user-123/1705123456` |
| Batch notifications | `batch-<event>/<batch-id>` | `batch-order-notifications/batch-789` |
| Large batch chunk | `<batch-prefix>/chunk-<index>` | `campaign-abc/chunk-0` |

### Node.js

The Node.js SDK has a dedicated `idempotencyKey` option:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// Single email
const { data, error } = await resend.emails.send(
  {
    from: 'Acme <onboarding@resend.dev>',
    to: ['delivered@resend.dev'],
    subject: 'Order Confirmation',
    html: '<p>Your order has been confirmed.</p>',
  },
  {
    idempotencyKey: `order-confirmation/${orderId}`,
  }
);

// Batch email
const { data, error } = await resend.batch.send(
  [
    { from: 'Acme <noreply@acme.com>', to: ['delivered@resend.dev'], subject: 'Hello', html: '<p>Hi</p>' },
    { from: 'Acme <noreply@acme.com>', to: ['delivered@resend.dev'], subject: 'Hello', html: '<p>Hi</p>' },
  ],
  { idempotencyKey: `batch-welcome/${batchId}` }
);
```

### Python

```python
import resend
import os

resend.api_key = os.environ["RESEND_API_KEY"]

# Single email
email = resend.Emails.send({
    "from": "Acme <onboarding@resend.dev>",
    "to": ["delivered@resend.dev"],
    "subject": "Order Confirmation",
    "html": "<p>Your order has been confirmed.</p>",
}, idempotency_key=f"order-confirmation/{order_id}")

# Batch email
result = resend.Batch.send(emails, idempotency_key=f"batch-orders/{batch_id}")
```

### Go

Other SDKs use the `Idempotency-Key` header:

```go
import "github.com/resend/resend-go/v3"

client := resend.NewClient(os.Getenv("RESEND_API_KEY"))

// Single email
params := &resend.SendEmailRequest{
    From:    "Acme <onboarding@resend.dev>",
    To:      []string{"delivered@resend.dev"},
    Subject: "Order Confirmation",
    Html:    "<p>Your order has been confirmed.</p>",
    Headers: map[string]string{
        "Idempotency-Key": fmt.Sprintf("order-confirmation/%s", orderID),
    },
}

sent, err := client.Emails.Send(params)
```

### cURL

```bash
curl -X POST 'https://api.resend.com/emails' \
  -H 'Authorization: Bearer re_xxxxxxxxx' \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: order-confirmation/12345' \
  -d '{
    "from": "Acme <onboarding@resend.dev>",
    "to": ["delivered@resend.dev"],
    "subject": "Order Confirmation",
    "html": "<p>Your order has been confirmed.</p>"
  }'
```

## Error Handling

### Common Error Codes

| Code | Name | Description | Action |
|------|------|-------------|--------|
| 400 | `validation_error` | Invalid parameters | Fix request, don't retry |
| 400 | `invalid_idempotency_key` | Key must be 1-256 characters | Fix key format, don't retry |
| 401 | `authentication_error` | Invalid API key | Check RESEND_API_KEY, don't retry |
| 403 | `authorization_error` | Domain not verified | Verify domain at resend.com/domains |
| 409 | `invalid_idempotent_request` | Key used with different payload | Use new key or fix payload |
| 409 | `concurrent_idempotent_requests` | Same key request in progress | Wait and retry |
| 422 | `unprocessable_entity` | Invalid email format/content | Fix content, don't retry |
| 429 | `rate_limit_exceeded` | Too many requests | Retry with exponential backoff |
| 500 | `api_error` | Server error | Retry with exponential backoff |

### Retryable vs Non-Retryable

**Don't retry (fix the request):**
- 400 - Bad request / validation errors
- 401 - Invalid API key
- 403 - Domain not verified
- 409 - Idempotency conflict (different payload)
- 422 - Unprocessable entity

**Safe to retry with backoff:**
- 429 - Rate limited
- 500 - Server error

### Node.js

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: 'Acme <onboarding@resend.dev>',
  to: ['delivered@resend.dev'],
  subject: 'Hello',
  html: '<p>Hello world</p>',
});

if (error) {
  switch (error.name) {
    case 'validation_error':
      // Invalid parameters - don't retry, fix the data
      throw new Error(`Invalid email params: ${error.message}`);

    case 'rate_limit_exceeded':
      // Rate limited - safe to retry with backoff
      console.log('Rate limited, should retry with backoff');
      break;

    case 'api_error':
      // Server error - safe to retry
      console.log('Server error, should retry');
      break;

    case 'invalid_idempotent_request':
      // Idempotency conflict - don't retry with same key
      throw new Error('Duplicate request with different payload');

    default:
      console.error('Unexpected error:', error);
  }
  return;
}

console.log('Email sent:', data.id);
```

### Python

```python
import resend
import os

resend.api_key = os.environ["RESEND_API_KEY"]

try:
    email = resend.Emails.send({
        "from": "Acme <onboarding@resend.dev>",
        "to": ["delivered@resend.dev"],
        "subject": "Hello",
        "html": "<p>Hello world</p>",
    })
    print(f"Email sent: {email['id']}")
except resend.exceptions.ValidationError as e:
    # Invalid parameters - don't retry
    print(f"Validation error: {e}")
except resend.exceptions.RateLimitError as e:
    # Rate limited - retry after delay
    print(f"Rate limited: {e}")
except resend.exceptions.ResendError as e:
    # Other API error
    print(f"API error: {e}")
```

### Go

```go
import (
    "fmt"
    "github.com/resend/resend-go/v3"
)

client := resend.NewClient(os.Getenv("RESEND_API_KEY"))

params := &resend.SendEmailRequest{
    From:    "Acme <onboarding@resend.dev>",
    To:      []string{"delivered@resend.dev"},
    Subject: "Hello",
    Html:    "<p>Hello world</p>",
}

sent, err := client.Emails.Send(params)
if err != nil {
    // Check error type and handle accordingly
    fmt.Printf("Failed to send email: %v\n", err)
    return
}

fmt.Printf("Email sent: %s\n", sent.Id)
```

## Retry Logic

Implement exponential backoff for transient failures. Don't retry validation errors or idempotency conflicts.

### Strategy

| Attempt | Delay | Total Wait |
|---------|-------|------------|
| 1 | 1s | 1s |
| 2 | 2s | 3s |
| 3 | 4s | 7s |
| 4 | 8s | 15s |
| 5 | 16s | 31s |

**Recommendations:**
- Max 3-5 retries for most use cases
- Only retry 429 (rate limit) and 500 (server error)
- Always use idempotency keys when retrying

### Node.js

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmailWithRetry(
  params: Parameters<typeof resend.emails.send>[0],
  options: { maxRetries?: number; idempotencyKey?: string } = {}
) {
  const { maxRetries = 3, idempotencyKey } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await resend.emails.send(
      params,
      idempotencyKey ? { idempotencyKey } : undefined
    );

    if (!error) {
      return data;
    }

    // Don't retry validation errors or idempotency conflicts
    if (error.name === 'validation_error' || error.name === 'invalid_idempotent_request') {
      throw new Error(`${error.name}: ${error.message}`);
    }

    // Last attempt failed
    if (attempt === maxRetries) {
      throw new Error(`Failed after ${maxRetries + 1} attempts: ${error.message}`);
    }

    // Exponential backoff: 1s, 2s, 4s...
    const delay = Math.pow(2, attempt) * 1000;
    console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

// Usage
const result = await sendEmailWithRetry(
  {
    from: 'Acme <onboarding@resend.dev>',
    to: ['delivered@resend.dev'],
    subject: 'Order Confirmation',
    html: '<p>Your order is confirmed.</p>',
  },
  { idempotencyKey: `order-confirmation/${orderId}` }
);
```

### Python

```python
import resend
import os
import time

resend.api_key = os.environ["RESEND_API_KEY"]

def send_email_with_retry(params, max_retries=3, idempotency_key=None):
    for attempt in range(max_retries + 1):
        try:
            return resend.Emails.send(params, idempotency_key=idempotency_key)
        except resend.exceptions.ValidationError:
            # Don't retry validation errors
            raise
        except resend.exceptions.ResendError as e:
            if attempt == max_retries:
                raise Exception(f"Failed after {max_retries + 1} attempts: {e}")

            # Exponential backoff: 1s, 2s, 4s...
            delay = (2 ** attempt)
            print(f"Attempt {attempt + 1} failed, retrying in {delay}s...")
            time.sleep(delay)

# Usage
result = send_email_with_retry(
    {
        "from": "Acme <onboarding@resend.dev>",
        "to": ["delivered@resend.dev"],
        "subject": "Order Confirmation",
        "html": "<p>Your order is confirmed.</p>",
    },
    idempotency_key=f"order-confirmation/{order_id}"
)
```

### Go

```go
import (
    "fmt"
    "time"
    "github.com/resend/resend-go/v3"
)

func sendEmailWithRetry(client *resend.Client, params *resend.SendEmailRequest, maxRetries int) (*resend.SendEmailResponse, error) {
    var lastErr error

    for attempt := 0; attempt <= maxRetries; attempt++ {
        sent, err := client.Emails.Send(params)
        if err == nil {
            return sent, nil
        }

        lastErr = err

        if attempt == maxRetries {
            break
        }

        // Exponential backoff: 1s, 2s, 4s...
        delay := time.Duration(1<<attempt) * time.Second
        fmt.Printf("Attempt %d failed, retrying in %v...\n", attempt+1, delay)
        time.Sleep(delay)
    }

    return nil, fmt.Errorf("failed after %d attempts: %w", maxRetries+1, lastErr)
}

// Usage
client := resend.NewClient(os.Getenv("RESEND_API_KEY"))

params := &resend.SendEmailRequest{
    From:    "Acme <onboarding@resend.dev>",
    To:      []string{"delivered@resend.dev"},
    Subject: "Order Confirmation",
    Html:    "<p>Your order is confirmed.</p>",
    Headers: map[string]string{
        "Idempotency-Key": fmt.Sprintf("order-confirmation/%s", orderID),
    },
}

sent, err := sendEmailWithRetry(client, params, 3)
```

## Batch-Specific Practices

### Pre-send Validation

The entire batch fails if any single email has invalid data. Always validate before sending.

**Key validations:**
- Batch size: 1-100 emails
- Recipients per email: 1-50
- Required fields: `from`, `to`, `subject`, `html` or `text`
- Valid email format for all recipients

See [batch-email-examples.md](batch-email-examples.md) for complete validation implementations.

### Chunking Large Batches

For sends larger than 100 emails, chunk into multiple batch requests with unique idempotency keys per chunk.

```typescript
// Node.js example pattern
const BATCH_SIZE = 100;

async function sendLargeBatch(emails: Email[], batchPrefix: string) {
  const chunks: Email[][] = [];

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    chunks.push(emails.slice(i, i + BATCH_SIZE));
  }

  const results = await Promise.all(
    chunks.map(async (chunk, index) => {
      // Each chunk gets its own idempotency key
      const idempotencyKey = `${batchPrefix}/chunk-${index}`;
      return resend.batch.send(chunk, { idempotencyKey });
    })
  );

  return results;
}
```

See [batch-email-examples.md](batch-email-examples.md) for complete chunking implementations in all SDKs.

### Batch Limitations

Remember that the batch endpoint does **NOT** support:
- `attachments` - Use individual sends for emails with attachments
- `scheduled_at` - Use individual sends for scheduled emails
- Partial success - If one email fails validation, the entire batch fails
