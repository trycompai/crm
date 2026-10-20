# QuickBooks OAuth refresh

QuickBooks is optional and disabled by default. Production stays disabled until the owner completes enrollment and verification.

This repository has no existing QuickBooks integration on `main` or `release`.
This implementation adds a small agent integration for issue #228.
It does not add a public OAuth callback or a connection settings page.

## Intuit configuration

1. Create an Intuit app with the QuickBooks Online Accounting scope, `com.intuit.quickbooks.accounting`.
2. Use sandbox credentials first. Keep sandbox and production credentials separate.
3. Complete owner authorization through Intuit's OAuth playground or your approved OAuth enrollment flow.
4. Register the exact redirect URI used by that flow in the Intuit application.
5. Use the returned `realmId`. Never copy a customer ID into the realm setting.
6. Keep both access and refresh tokens private. Do not paste tokens into agent conversations, GitHub, or command arguments.

Intuit references: [OAuth client](https://github.com/intuit/oauth-jsclient), [OAuth authorization](https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0).

## Vercel configuration

Set these variables on the **agent** deployment. Use the root `.env` for local development.
Use separate databases and encryption keys for Preview and Production.

| Variable | Value |
| --- | --- |
| `QUICKBOOKS_ENABLED` | `false` during enrollment and verification |
| `QUICKBOOKS_ENVIRONMENT` | `sandbox` or `production` |
| `QUICKBOOKS_CLIENT_ID` | Matching Intuit app client ID |
| `QUICKBOOKS_CLIENT_SECRET` | Matching Intuit app client secret |
| `QUICKBOOKS_REALM_ID` | Company realm from owner authorization |
| `QUICKBOOKS_ENCRYPTION_KEY` | 32 random bytes, encoded as 64 hexadecimal characters |
| `DATABASE_URL` | Existing PostgreSQL database with the new migration applied |

The root Turbo configuration passes these variables through without using secrets as cache keys.
No access token or refresh token belongs in Vercel environment variables.
The encrypted token pair lives in PostgreSQL and survives restarts and cold starts.
Keep the encryption key stable. Losing or changing it requires owner re-enrollment.

## Owner enrollment

Disable QuickBooks on every running deployment before replacing an enrollment.
Apply migrations with `bun run db:deploy`. Generate the client with `bun run db:generate`.

Run `bun apps/agent/scripts/enroll-quickbooks.ts` from the repository root.
Supply one JSON document through standard input from a protected secret source:

```json
{
  "ownerId": "existing-workspace-owner-user-id",
  "companyName": "Exact company name from QuickBooks",
  "tokens": {
    "accessToken": "owner-authorized-access-token",
    "refreshToken": "owner-authorized-refresh-token"
  }
}
```

The script requires database administration access. It is not a public authentication endpoint.
It checks workspace owner membership and reads CompanyInfo from the configured realm.
It refuses a different company name and stores credentials only after verification.
It encrypts credentials with AES-256-GCM, bound to the environment and realm.
It does not enable the deployment or create an estimate.

## Verification before production

1. Complete sandbox enrollment and enable only the sandbox deployment.
2. Read a known customer with `read_quickbooks`.
3. After access-token expiry, repeat the read. Confirm refresh succeeds and the read succeeds.
4. Restart the agent and repeat the read. Confirm the stored token pair still works.
5. Request an estimate draft. Deny approval and confirm that no estimate appears.
6. Request another draft. Approve it and confirm one unsent Pending estimate in the enrolled company.
7. Verify the customer, item IDs, amounts, currency, and tax behavior in QuickBooks.
8. Complete production owner authorization and enrollment with production credentials.
9. Record owner sign-off before setting `QUICKBOOKS_ENABLED=true` on Production, then redeploy.

The owner performs live verification. Automated tests use mocked HTTP and never access a real company.

## Request behavior

- Reads accept only known customer, item, and estimate IDs. No tool accepts a realm or arbitrary URL.
- One `401` triggers refresh and exactly one replay. A second `401` fails without another refresh.
- A failed refresh, malformed response, or failed token save stops the replay.
- A database row lock serializes refreshes across Vercel instances. Waiting requests reuse the saved token.
- The rotated refresh token is committed before the original request repeats.
- Redirects are refused. HTTP requests have a timeout. Other HTTP failures are not retried.
- Every draft requires eve human approval. Scheduled app-principal runs are denied.
- Existing telemetry counts the two tool names only. It never sends tokens, realm IDs, or estimate contents.
- The estimate stays `Pending` with `EmailStatus=NotSet`. No email or invoice endpoint exists.
- A request ID derived from the session and tool call stays fixed across the `401` replay and durable re-execution.

## Recovery

Invalid refresh credentials require owner re-enrollment. Disable the integration before enrollment.
Disable it with `QUICKBOOKS_ENABLED=false` and redeploy to stop new requests.
In-flight requests can finish. Check QuickBooks before repeating a timed-out draft with a new tool call.

The token endpoint and database cannot share one transaction.
A crash after Intuit rotates tokens but before the database commit requires recovery with the last accepted refresh token or owner re-enrollment.
No external write proceeds after a failed token save.
