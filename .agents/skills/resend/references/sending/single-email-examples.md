# Resend Examples

## Table of Contents

- [Idempotency Keys](#idempotency-keys)
- [Error Handling](#error-handling)
- [Retry Logic](#retry-logic)
- [Complete Examples](#complete-examples)

## Idempotency Keys

Use idempotency keys to prevent duplicate emails when retrying failed requests. Keys expire after 24 hours and have a max length of 256 characters.

**Key format:** Use `<event-type>/<entity-id>` pattern (e.g., `welcome-email/user-123`, `order-confirmation/order-456`).

**Behavior:** If same key is sent with a different payload, Resend returns a 409 error. If same key with same payload, returns the original response without resending.

### Node.js

The Node.js SDK has a dedicated `idempotencyKey` option:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

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
```

### Python

```python
import resend
import os

resend.api_key = os.environ["RESEND_API_KEY"]

email = resend.Emails.send({
    "from": "Acme <onboarding@resend.dev>",
    "to": ["delivered@resend.dev"],
    "subject": "Order Confirmation",
    "html": "<p>Your order has been confirmed.</p>",
}, idempotency_key=f"order-confirmation/{order_id}")
```

### Go

Other SDKs use the `Idempotency-Key` header:

```go
import "github.com/resend/resend-go/v3"

client := resend.NewClient(os.Getenv("RESEND_API_KEY"))

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

| Code | Description | Action |
|------|-------------|--------|
| 400 | Bad request (invalid params) | Fix request parameters |
| 400 | `invalid_idempotency_key` | Key must be 1-256 characters |
| 401 | Invalid API key | Check RESEND_API_KEY |
| 403 | Domain not verified | Verify domain at resend.com/domains |
| 409 | `invalid_idempotent_request` | Key already used with different payload |
| 409 | `concurrent_idempotent_requests` | Same key request in progress, retry later |
| 422 | Unprocessable entity | Check email format/content |
| 429 | Rate limited | Implement backoff and retry |
| 500 | Server error | Retry with backoff |

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
  console.error('Failed to send email:', error.message);

  // Handle specific error types
  if (error.name === 'validation_error') {
    // Invalid parameters - don't retry
    throw new Error(`Invalid email params: ${error.message}`);
  }

  if (error.name === 'rate_limit_exceeded') {
    // Rate limited - retry after delay
    console.log('Rate limited, retrying...');
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

Implement exponential backoff for transient failures (rate limits, server errors). Don't retry 409 `invalid_idempotent_request` errors (different payload).

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

## Complete Examples

### Node.js - Production-Ready Email Service

```typescript
import { Resend } from 'resend';
import { randomUUID } from 'crypto';

const resend = new Resend(process.env.RESEND_API_KEY);

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  idempotencyKey?: string;
  maxRetries?: number;
}

async function sendEmail(options: SendEmailOptions) {
  const {
    to,
    subject,
    html,
    from = 'Acme <noreply@acme.com>',
    replyTo,
    idempotencyKey = randomUUID(),
    maxRetries = 3,
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { data, error } = await resend.emails.send(
      {
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo && { replyTo }),
      },
      { idempotencyKey }
    );

    if (!error) {
      return { success: true, id: data.id };
    }

    // Don't retry client errors or idempotency conflicts
    if (error.name === 'validation_error' || error.name === 'not_found' || error.name === 'invalid_idempotent_request') {
      return { success: false, error: error.message, retryable: false };
    }

    if (attempt < maxRetries) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { success: false, error: 'Max retries exceeded', retryable: true };
}

// Usage
const result = await sendEmail({
  to: 'delivered@resend.dev',
  subject: 'Welcome!',
  html: '<h1>Welcome to Acme</h1>',
  idempotencyKey: `welcome-email/${userId}`,
});
```

### Python - Production-Ready Email Service

```python
import resend
import os
import time
import uuid
from dataclasses import dataclass
from typing import Optional, Union, List

resend.api_key = os.environ["RESEND_API_KEY"]

@dataclass
class EmailResult:
    success: bool
    id: Optional[str] = None
    error: Optional[str] = None
    retryable: bool = False

def send_email(
    to: Union[str, List[str]],
    subject: str,
    html: str,
    from_addr: str = "Acme <noreply@acme.com>",
    reply_to: Optional[str] = None,
    idempotency_key: Optional[str] = None,
    max_retries: int = 3,
) -> EmailResult:
    idempotency_key = idempotency_key or str(uuid.uuid4())
    recipients = [to] if isinstance(to, str) else to

    params = {
        "from": from_addr,
        "to": recipients,
        "subject": subject,
        "html": html,
    }
    if reply_to:
        params["reply_to"] = reply_to

    for attempt in range(max_retries + 1):
        try:
            result = resend.Emails.send(params, idempotency_key=idempotency_key)
            return EmailResult(success=True, id=result["id"])
        except resend.exceptions.ValidationError as e:
            return EmailResult(success=False, error=str(e), retryable=False)
        except resend.exceptions.ResendError as e:
            if attempt < max_retries:
                time.sleep(2 ** attempt)
            else:
                return EmailResult(success=False, error=str(e), retryable=True)

    return EmailResult(success=False, error="Max retries exceeded", retryable=True)

# Usage
result = send_email(
    to="delivered@resend.dev",
    subject="Welcome!",
    html="<h1>Welcome to Acme</h1>",
    idempotency_key=f"welcome-email/{user_id}",
)
```
