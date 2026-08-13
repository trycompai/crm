# Logs

View API request logs programmatically. Useful for debugging, auditing API usage, and monitoring integrations. Each log captures a single API request with its endpoint, method, status code, and user agent. Retrieve a specific log to see the full request and response bodies.

## SDK Methods

| Operation | Node.js | Python |
|-----------|---------|--------|
| List | `resend.logs.list(params)` | Not yet available |
| Get | `resend.logs.get(id)` | Not yet available |

> **SDK availability:** Logs are currently only available in the Node.js SDK and via cURL. Other SDKs (Python, Go, Ruby, PHP, Rust, Java, .NET) do not yet support logs — use cURL as a fallback.

## List Logs

`GET /logs`

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `limit` | number | Yes | 20 | Number of logs to return. Min 1, max 100. |
| `after` | string | No | — | Log ID to paginate forward from. Cannot combine with `before`. |
| `before` | string | No | — | Log ID to paginate backward from. Cannot combine with `after`. |

### Node.js

```typescript
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY);

// List recent logs
const { data, error } = await resend.logs.list({ limit: 20 });

if (error) {
  console.error(error);
  return;
}

console.log(data.has_more); // true if more pages exist
for (const log of data.data) {
  console.log(`${log.method} ${log.endpoint} → ${log.response_status}`);
}

// Paginate forward
const { data: nextPage } = await resend.logs.list({
  limit: 20,
  after: data.data[data.data.length - 1].id,
});
```

### cURL

```bash
curl -s "https://api.resend.com/logs?limit=20" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "User-Agent: curl"
```

### Response

```json
{
  "object": "list",
  "has_more": true,
  "data": [
    {
      "id": "37e4414c-5e25-4dbc-a071-43552a4bd53b",
      "created_at": "2026-03-30 13:43:54.622865+00",
      "endpoint": "/emails",
      "method": "POST",
      "response_status": 200,
      "user_agent": "resend-node:6.0.3"
    }
  ]
}
```

## Retrieve Log

`GET /logs/{log_id}`

Returns a single log with full request and response bodies.

### Node.js

```typescript
const { data, error } = await resend.logs.get('37e4414c-5e25-4dbc-a071-43552a4bd53b');

if (error) {
  console.error(error);
  return;
}

console.log(data.request_body);   // original request payload
console.log(data.response_body);  // original response payload
console.log(data.response_status); // HTTP status code
```

### cURL

```bash
curl -s "https://api.resend.com/logs/37e4414c-5e25-4dbc-a071-43552a4bd53b" \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "User-Agent: curl"
```

### Response

```json
{
  "object": "log",
  "id": "37e4414c-5e25-4dbc-a071-43552a4bd53b",
  "created_at": "2026-03-30 13:43:54.622865+00",
  "endpoint": "/emails",
  "method": "POST",
  "response_status": 200,
  "user_agent": "resend-node:6.0.3",
  "request_body": {
    "from": "Acme <onboarding@resend.dev>",
    "to": ["delivered@resend.dev"],
    "subject": "Hello World"
  },
  "response_body": {
    "id": "4ef9a417-02e9-4d39-ad75-9611e0fcc33c"
  }
}
```

## Response Fields

| Field | In List | In Get | Description |
|-------|---------|--------|-------------|
| `id` | Yes | Yes | Log UUID |
| `created_at` | Yes | Yes | Timestamp with timezone |
| `endpoint` | Yes | Yes | API path called (e.g., `/emails`, `/domains`) |
| `method` | Yes | Yes | HTTP method (GET, POST, DELETE, etc.) |
| `response_status` | Yes | Yes | HTTP response status code |
| `user_agent` | Yes | Yes | Client user agent (includes SDK name/version) |
| `request_body` | No | Yes | Original request payload |
| `response_body` | No | Yes | Original response payload |

## Pagination

Cursor-based using `after` and `before` parameters:

- **Forward:** pass `after` with the last log's `id` to get the next page
- **Backward:** pass `before` with the first log's `id` to get the previous page
- **Cannot combine** `after` and `before` in the same request (returns 422)
- Check `has_more` to know if more pages exist

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Expecting `request_body`/`response_body` in list response | These fields are only returned by the get endpoint — call `resend.logs.get(id)` for full details |
| Using both `after` and `before` together | Pick one — they are mutually exclusive (returns 422) |
| Using Python/Go/Ruby SDK for logs | Logs are only in the Node.js SDK currently — use cURL for other languages |
| Not passing `limit` | `limit` is required — set it explicitly (1–100, default 20) |
| Calling `.delete()` or `.remove()` | Logs are read-only — there are no create, update, or delete operations |
| Missing `User-Agent` header in cURL | Resend API requires a `User-Agent` header — omitting it returns 403 |
