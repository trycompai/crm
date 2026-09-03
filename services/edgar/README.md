# edgar — SEC EDGAR research for the CRM

A small HTTP service on [edgartools](https://edgartools.readthedocs.io) that the
agent's `sec_*` tools and the app's SEC page call. It reads SEC EDGAR (free, no
API key) and answers JSON: company profile, filings, full-text search, 5%+
holders from Schedule 13D/13G, insider transactions from Forms 3/4/5, the latest
proxy statement (DEF 14A) with its executives and their pay, and a CEO-pay
comparison across tickers.

The SEC requires every automated client to identify itself, so `EDGAR_IDENTITY`
(a name and a real email) is mandatory.

## The contract, which any external service can reuse

| Piece | Here |
| --- | --- |
| Base URL | `EDGAR_URL` in the CRM's `.env`, e.g. `http://127.0.0.1:2100` |
| Auth | `authorization: Bearer <EDGAR_SECRET>`; optional on loopback |
| Liveness | `GET /health` → `{ ok, version, edgartools, identitySet }` |
| Answers | JSON, HTTP 200; `404 { reason }` for a missing record; `502 { reason }` when the SEC misbehaves; `401 { reason }` for a bad secret |
| CRM side | every response parsed with Zod in `packages/validation/src/edgar.ts`; a missing `EDGAR_URL` turns the capability off |

Only the routes are SEC-specific. A service for another source keeps the same
shape.

## Routes

| Route | Answers |
| --- | --- |
| `GET /companies/search?q=&limit=` | companies matching a name, ticker or CIK |
| `GET /companies/{cik or ticker}` | profile: tickers, exchanges, SIC, state, fiscal year end, address, former names |
| `GET /companies/{key}/filings?form=&from=&to=&limit=` | filings, newest first |
| `GET /filings/search?q=&form=&from=&to=&limit=` | full-text search across all filers |
| `GET /companies/{key}/owners?minPercent=&form=13D\|13G\|all&limit=` | 5%+ holders, one row per holder from their newest filing |
| `GET /companies/{key}/insiders?limit=` | Forms 3/4/5, one row per filing |
| `GET /companies/{key}/proxy?years=` | latest DEF 14A: executives, CEO pay, pay vs performance, holders, proposals, pay ratio |
| `GET /compensation/compare?tickers=A,B&years=` | CEO pay rows per ticker and fiscal year |

## Run it with Docker Compose (default)

```sh
# in the repo's .env
EDGAR_IDENTITY="Jane Doe jane@example.com"
EDGAR_URL="http://127.0.0.1:2100"

docker compose up -d edgar
curl http://127.0.0.1:2100/health
```

The edgartools cache lives in the `crm-edgar-cache` volume, so repeat lookups
are fast and the SEC rate limit (10 requests a second) is respected by
edgartools itself.

## Run it on another machine

```sh
cd services/edgar
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
EDGAR_IDENTITY="Jane Doe jane@example.com" EDGAR_SECRET="$(openssl rand -hex 24)" \
  uvicorn edgar_service.app:app --host 0.0.0.0 --port 2100
```

Expose it with a tunnel when the CRM runs elsewhere:

```sh
cloudflared tunnel --url http://127.0.0.1:2100
```

Then set `EDGAR_URL` to the tunnel URL and `EDGAR_SECRET` to the same secret in
the CRM's environment (Vercel → crm-agent, or the local `.env`). A quick tunnel
URL changes on every start.

## Run it in Google Colab

Open `colab.ipynb` in Colab and run the cells: it installs the service, sets the
identity and a generated secret, starts uvicorn and a `cloudflared` tunnel, and
prints the `EDGAR_URL` and `EDGAR_SECRET` to paste into the CRM. The service
lives as long as the notebook does.

## Tests

```sh
pip install -e ".[dev]"
pytest                      # mocked edgartools objects
EDGAR_LIVE=1 python tests/smoke_live.py   # real calls on CIK 320193
```
