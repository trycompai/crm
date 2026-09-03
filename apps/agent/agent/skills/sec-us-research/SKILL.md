---
description: Use when asked about a US public company, its SEC filings, who runs it and what they are paid, who its large shareholders are, or to find and import US listed targets — SEC EDGAR through the edgar service, with a filing URL on every line.
---

# SEC EDGAR research

Every US public company files with the SEC, and every filing is public and
dated. The `sec_*` tools read them through the edgar service. They are free,
they need no key, and each answer carries the filing URL: that URL is the
source you cite, and a claim without one does not go in the CRM.

## 1. Identify the company

`sec_search_companies` with the name, the ticker or the CIK, then
`sec_get_company` on the match. The CIK is the key for everything after. A
name search can return a fund or a subsidiary with a similar name; check the
SIC description and the state before going on. If the tools answer
"unavailable", the service is not configured here: say so and stop.

## 2. Read the company

- `sec_get_company` gives the profile: legal name, tickers, SIC and industry,
  state of incorporation, fiscal year end, business address, former names.
- `sec_list_filings` with a form for the documents that matter: `10-K` for
  the annual report, `8-K` for events, `DEF 14A` for governance and pay.
- `sec_search_filings` across all companies when the question is "who
  mentions X": a product, a customer, a competitor, a technology.

## 3. Who owns it

`sec_list_owners` lists holders of 5% or more from Schedule 13D and 13G.
13D is an active holder with intent; 13G is passive. Holdings are as of the
filing date. A holder below 5% never files, so absence is not zero.

## 4. Who runs it, and what they are paid

`sec_get_proxy` reads the latest DEF 14A: the named executives with titles
and the summary compensation table, the CEO's pay and pay actually paid with
the NEO average over the last years, pay versus performance, the holders the
proxy lists, the proposals, the CEO pay ratio. `sec_list_insiders` names
officers and directors with their titles from Forms 3/4/5 and shows recent
buys, sells and grants. `sec_compare_compensation` puts several tickers side
by side.

Titles in the proxy are the company's own words; keep them. A name written
"Mr. Cook" in the pay-versus-performance table is the same person as "Tim
Cook" in the compensation table; use the full name.

## 5. Deliver

Write the answer as a table where it fits: company, CIK, ticker, SIC, state,
CEO, total pay, pay actually paid, TSR, 5%+ holders with percent. Under it,
the filing each figure came from, with its date. Blanks stay blanks.

## 6. Import into the CRM

When the rep wants the company in the CRM, `add_company` with the name, the
website when the profile has one, `countryCode` US, the state as
`stateCode`, the city, the `cik`, the first `ticker` and the `sic`. The source
is the EDGAR page `sec_get_company` returns as `sourceUrl`. The tool returns
the existing company when there is one.

Executives go on with `add_contact` on that company: first name, last name,
the title as the proxy states it, and the proxy's filing URL as the source.
Then `record_fact` for the title with `web.cited-claim` and the same URL. A
5%+ holder is an institution, not a person: name it in the write-up, do not
add it as a contact.

## Rules

- **The filing URL is the source.** No filing, no line.
- **Never fetch linkedin.com** and never invent a profile URL; the people
  pipeline finds profiles its own way after `add_contact`.
- **Numbers are the filing's numbers.** No conversion, no rounding beyond
  what you show, the fiscal year end next to every figure.
- **A parse gap is a blank.** When the proxy carries no readable table, say
  the figure is not machine-readable in that filing.
