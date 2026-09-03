import os
import re
from datetime import date
from importlib import metadata
from typing import Any

import edgar
from edgar import Company, CompanyNotFoundError, find_company, get_identity, set_identity
from edgar import search_filings as efts_search

from .config import Settings
from .values import cik_text, day, number, rows, text, whole

BROWSE_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK="
OWNER_FORMS = {
    "13D": ["SCHEDULE 13D", "SC 13D"],
    "13G": ["SCHEDULE 13G", "SC 13G"],
}
INSIDER_FORMS = ["3", "4", "5"]
PROXY_FORM = "DEF 14A"
EFTS_FIRST_DAY = "2001-01-01"
DISPLAY_NAME = re.compile(r"^(.*?)\s+\((?:[A-Z.\-]+\)\s+\()?CIK")
HOLDER_SHARE_KEYS = ("shares", "amount", "shares_beneficially_owned", "amount_beneficially_owned")

_settings: Settings | None = None


class NotFound(Exception):
    pass


class Upstream(Exception):
    pass


def configure(settings: Settings) -> None:
    global _settings
    _settings = settings
    if settings.data_dir:
        os.environ.setdefault("EDGAR_LOCAL_DATA_DIR", settings.data_dir)
    if settings.identity:
        set_identity(settings.identity)


def edgartools_version() -> str:
    try:
        return metadata.version("edgartools")
    except metadata.PackageNotFoundError:
        return getattr(edgar, "__version__", "unknown")


def identity_set() -> bool:
    try:
        return bool(get_identity())
    except Exception:
        return False


def _limits() -> Settings:
    if _settings is None:
        raise Upstream("The service is not configured.")
    return _settings


def _company(key: str) -> Any:
    cleaned = key.strip()
    try:
        company = Company(int(cleaned)) if cleaned.isdigit() else Company(cleaned.upper())
    except CompanyNotFoundError as error:
        raise NotFound(f"No SEC filer matches {cleaned}.") from error
    except Exception as error:
        if "not found" in str(error).lower():
            raise NotFound(f"No SEC filer matches {cleaned}.") from error
        raise Upstream(f"SEC lookup failed for {cleaned}: {error}") from error
    if company is None or getattr(company, "not_found", False):
        raise NotFound(f"No SEC filer matches {cleaned}.")
    return company


def _match(company: Any) -> dict[str, Any]:
    data = company.data
    tickers = list(getattr(data, "tickers", None) or [])
    exchanges = list(getattr(data, "exchanges", None) or [])
    return {
        "cik": cik_text(company.cik),
        "name": text(company.name) or f"CIK {cik_text(company.cik)}",
        "ticker": tickers[0] if tickers else None,
        "exchange": exchanges[0] if exchanges else None,
    }


def search_companies(query: str, limit: int) -> list[dict[str, Any]]:
    found: dict[str, dict[str, Any]] = {}
    cleaned = query.strip()

    if cleaned.isdigit() or (cleaned.isalpha() and len(cleaned) <= 6):
        try:
            match = _match(_company(cleaned))
            found[match["cik"]] = match
        except (NotFound, Upstream):
            pass

    try:
        results = find_company(cleaned, top_n=limit)
        for index in range(len(results)):
            match = _match(results[index])
            found.setdefault(match["cik"], match)
    except Exception as error:
        if not found:
            raise Upstream(f"SEC company search failed: {error}") from error

    return list(found.values())[:limit]


def _address(company: Any) -> dict[str, Any] | None:
    try:
        address = company.business_address()
    except Exception:
        return None
    if address is None or getattr(address, "empty", False):
        return None
    street = " ".join(part for part in [text(address.street1), text(address.street2)] if part)
    return {
        "street": street or None,
        "city": text(address.city),
        "state": text(address.state_or_country),
        "zip": text(address.zipcode),
    }


def company(key: str) -> dict[str, Any]:
    entity = _company(key)
    data = entity.data
    former = getattr(data, "former_names", None) or []
    return {
        "cik": cik_text(entity.cik),
        "name": text(entity.name) or f"CIK {cik_text(entity.cik)}",
        "tickers": [t for t in (getattr(data, "tickers", None) or []) if t],
        "exchanges": [e for e in (getattr(data, "exchanges", None) or []) if e],
        "sic": text(getattr(data, "sic", None)),
        "sicDescription": text(getattr(data, "sic_description", None)),
        "stateOfIncorporation": text(getattr(data, "state_of_incorporation", None)),
        "fiscalYearEnd": text(getattr(data, "fiscal_year_end", None)),
        "category": text(getattr(data, "category", None)),
        "businessAddress": _address(entity),
        "website": text(getattr(data, "website", None)),
        "formerNames": [name for name in (text(item.get("name")) for item in former if isinstance(item, dict)) if name],
        "url": f"{BROWSE_URL}{cik_text(entity.cik)}",
    }


def _filing_row(filing: Any) -> dict[str, Any]:
    return {
        "accession": text(filing.accession_no) or "",
        "form": text(filing.form) or "",
        "filedAt": day(filing.filing_date) or "",
        "reportDate": day(getattr(filing, "report_date", None)),
        "description": text(getattr(filing, "primary_doc_description", None)),
        "url": filing.homepage_url,
    }


def _entity_filings(entity: Any, form: Any, start: str | None, end: str | None) -> Any:
    try:
        filings = entity.get_filings(form=form) if form else entity.get_filings()
        if filings is not None and (start or end):
            filings = filings.filter(filing_date=f"{start or ''}:{end or ''}")
    except Exception as error:
        raise Upstream(f"SEC filings lookup failed: {error}") from error
    return filings


def filings(key: str, form: str | None, start: str | None, end: str | None, limit: int) -> dict[str, Any]:
    entity = _company(key)
    listing = _entity_filings(entity, form.strip() if form else None, start, end)
    if listing is None or getattr(listing, "empty", False):
        return {"filings": [], "truncated": False}
    page = list(listing.head(limit + 1))
    return {
        "filings": [_filing_row(filing) for filing in page[:limit]],
        "truncated": len(page) > limit,
    }


def _hit_company(hit: Any) -> dict[str, Any]:
    raw = text(getattr(hit, "company", None)) or ""
    match = DISPLAY_NAME.match(raw)
    return {"cik": cik_text(hit.cik), "name": (match.group(1) if match else raw) or f"CIK {cik_text(hit.cik)}"}


def search_filings(query: str, form: str | None, start: str | None, end: str | None, limit: int) -> dict[str, Any]:
    if start or end:
        start = start or EFTS_FIRST_DAY
        end = end or date.today().isoformat()
    try:
        results = efts_search(
            query.strip(),
            forms=form.strip() if form else None,
            start_date=start,
            end_date=end,
            limit=limit,
        )
        hits = list(iter(results.sort_by("filed")))[:limit]
        total = whole(getattr(results, "total", None)) or len(hits)
    except Exception as error:
        raise Upstream(f"SEC full-text search failed: {error}") from error

    out = []
    for hit in hits:
        accession = text(hit.accession_number) or ""
        cik = cik_text(hit.cik)
        out.append(
            {
                "accession": accession,
                "form": text(hit.form) or "",
                "filedAt": day(hit.filed) or "",
                "reportDate": day(getattr(hit, "period", None)),
                "description": text(getattr(hit, "file_description", None)),
                "url": f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession.replace('-', '')}/{accession}-index.html",
                "company": _hit_company(hit),
            }
        )
    return {"filings": out, "total": total}


def owners(key: str, min_percent: float, form: str, limit: int) -> dict[str, Any]:
    entity = _company(key)
    forms = OWNER_FORMS["13D"] + OWNER_FORMS["13G"] if form == "all" else OWNER_FORMS[form]
    listing = _entity_filings(entity, forms, None, None)
    if listing is None or getattr(listing, "empty", False):
        return {"owners": [], "filingsRead": 0}

    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    read = 0
    for filing in listing.head(_limits().max_owner_filings):
        read += 1
        try:
            schedule = filing.obj()
        except Exception:
            continue
        persons = getattr(schedule, "reporting_persons", None) or []
        items = getattr(schedule, "items", None)
        purpose = text(getattr(items, "item4_purpose_of_transaction", None)) if "13D" in str(filing.form) else None
        for person in persons:
            name = text(getattr(person, "name", None))
            if not name or name.lower() in seen:
                continue
            seen.add(name.lower())
            percent = number(getattr(person, "percent_of_class", None))
            if percent is None or percent < min_percent:
                continue
            out.append(
                {
                    "filer": name,
                    "form": text(filing.form) or "",
                    "filedAt": day(filing.filing_date) or "",
                    "shares": number(getattr(person, "aggregate_amount", None)),
                    "percent": percent,
                    "soleVoting": number(getattr(person, "sole_voting_power", None)),
                    "sharedVoting": number(getattr(person, "shared_voting_power", None)),
                    "purpose": purpose,
                    "url": filing.homepage_url,
                }
            )
            if len(out) >= limit:
                return {"owners": out, "filingsRead": read}
    return {"owners": out, "filingsRead": read}


def insiders(key: str, limit: int) -> dict[str, Any]:
    entity = _company(key)
    listing = _entity_filings(entity, INSIDER_FORMS, None, None)
    if listing is None or getattr(listing, "empty", False):
        return {"transactions": []}

    out = []
    for filing in listing.head(limit):
        try:
            form = filing.obj()
            summary = form.get_ownership_summary()
        except Exception:
            continue
        activities = list(getattr(summary, "transactions", None) or [])
        primary = activities[0] if activities else None
        insider = text(getattr(form, "insider_name", None))
        if not insider:
            continue
        out.append(
            {
                "insider": insider,
                "title": text(getattr(form, "position", None)),
                "form": text(filing.form) or "",
                "filedAt": day(filing.filing_date) or "",
                "kind": text(getattr(primary, "transaction_type", None)) or text(getattr(summary, "primary_activity", None)),
                "shares": number(getattr(primary, "shares", None)),
                "price": number(getattr(primary, "price_per_share", None)),
                "url": filing.homepage_url,
            }
        )
    return {"transactions": out}


def _latest_proxy(entity: Any) -> tuple[Any, Any]:
    listing = _entity_filings(entity, PROXY_FORM, None, None)
    if listing is None or getattr(listing, "empty", False):
        raise NotFound(f"No {PROXY_FORM} on file for {text(entity.name)}.")
    filing = list(listing.head(1))[0]
    try:
        statement = filing.obj()
    except Exception as error:
        raise Upstream(f"The proxy statement could not be parsed: {error}") from error
    if statement is None or not hasattr(statement, "peo_name"):
        raise Upstream("The proxy statement could not be parsed.")
    return filing, statement


def _by_year(frame: Any, years: int) -> list[dict[str, Any]]:
    items = rows(frame)
    items.sort(key=lambda row: str(row.get("fiscal_year_end") or ""), reverse=True)
    return items[:years]


def _holder_shares(row: dict[str, Any]) -> float | None:
    for key in HOLDER_SHARE_KEYS:
        if key in row:
            return number(row[key])
    return None


def proxy(key: str, years: int) -> dict[str, Any]:
    entity = _company(key)
    filing, statement = _latest_proxy(entity)
    ratio = getattr(statement, "ceo_pay_ratio", None)
    executives = []
    for row in rows(getattr(statement, "summary_compensation_table", None)):
        name = text(row.get("name"))
        if not name:
            continue
        executives.append(
            {
                "name": name,
                "title": text(row.get("title")),
                "year": whole(row.get("year")),
                "salary": number(row.get("salary")),
                "bonus": number(row.get("bonus")),
                "stockAwards": number(row.get("stock_awards")),
                "optionAwards": number(row.get("option_awards")),
                "nonEquityIncentive": number(row.get("non_equity_incentive")),
                "otherCompensation": number(row.get("other_compensation")),
                "total": number(row.get("total")),
            }
        )
    holders = []
    for row in rows(getattr(statement, "beneficial_ownership", None)):
        name = text(row.get("holder_name") or row.get("name"))
        if not name:
            continue
        holders.append({"name": name, "percentOfClass": number(row.get("percent_of_class")), "shares": _holder_shares(row)})
    proposals = [
        {
            "number": whole(getattr(item, "number", None)),
            "description": text(getattr(item, "description", None)) or "",
            "type": text(getattr(item, "proposal_type", None)),
        }
        for item in (getattr(statement, "voting_proposals", None) or [])
    ]
    return {
        "accession": text(filing.accession_no) or "",
        "filedAt": day(filing.filing_date) or "",
        "url": filing.homepage_url,
        "peo": {
            "name": text(getattr(statement, "peo_name", None)),
            "totalComp": number(getattr(statement, "peo_total_comp", None)),
            "actuallyPaidComp": number(getattr(statement, "peo_actually_paid_comp", None)),
        },
        "neoAverage": {
            "totalComp": number(getattr(statement, "neo_avg_total_comp", None)),
            "actuallyPaidComp": number(getattr(statement, "neo_avg_actually_paid_comp", None)),
        },
        "compensationByYear": [
            {
                "fiscalYearEnd": day(row.get("fiscal_year_end")),
                "peoTotalComp": number(row.get("peo_total_comp")),
                "peoActuallyPaidComp": number(row.get("peo_actually_paid_comp")),
                "neoAverageTotalComp": number(row.get("neo_avg_total_comp")),
                "neoAverageActuallyPaidComp": number(row.get("neo_avg_actually_paid_comp")),
            }
            for row in _by_year(getattr(statement, "executive_compensation", None), years)
        ],
        "payVsPerformance": [
            {
                "fiscalYearEnd": day(row.get("fiscal_year_end")),
                "peoActuallyPaidComp": number(row.get("peo_actually_paid_comp")),
                "neoAverageActuallyPaidComp": number(row.get("neo_avg_actually_paid_comp")),
                "tsr": number(row.get("total_shareholder_return")),
                "peerTsr": number(row.get("peer_group_tsr")),
                "netIncome": number(row.get("net_income")),
                "selectedMeasureValue": number(row.get("company_selected_measure_value")),
            }
            for row in _by_year(getattr(statement, "pay_vs_performance", None), years)
        ],
        "executives": executives,
        "holders": holders,
        "proposals": proposals,
        "performanceMeasures": [m for m in (text(item) for item in (getattr(statement, "performance_measures", None) or [])) if m],
        "selectedMeasureName": text(getattr(statement, "company_selected_measure", None)),
        "ceoPayRatio": None
        if ratio is None
        else {
            "ceo": number(getattr(ratio, "ceo_compensation", None)),
            "medianEmployee": number(getattr(ratio, "median_employee_compensation", None)),
            "ratio": number(getattr(ratio, "ratio", None)),
        },
        "insiderTradingPolicyAdopted": getattr(statement, "insider_trading_policy_adopted", None)
        if isinstance(getattr(statement, "insider_trading_policy_adopted", None), bool)
        else None,
    }


def compare(tickers: list[str], years: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for ticker in tickers:
        try:
            entity = _company(ticker)
            statement = proxy(ticker, years)
        except (NotFound, Upstream) as error:
            out.append(
                {
                    "ticker": ticker,
                    "cik": None,
                    "name": None,
                    "fiscalYearEnd": None,
                    "peoName": None,
                    "peoTotalComp": None,
                    "peoActuallyPaidComp": None,
                    "tsr": None,
                    "netIncome": None,
                    "reason": str(error),
                }
            )
            continue
        performance = {row["fiscalYearEnd"]: row for row in statement["payVsPerformance"]}
        for row in statement["compensationByYear"]:
            year = performance.get(row["fiscalYearEnd"], {})
            out.append(
                {
                    "ticker": ticker,
                    "cik": cik_text(entity.cik),
                    "name": text(entity.name),
                    "fiscalYearEnd": row["fiscalYearEnd"],
                    "peoName": statement["peo"]["name"],
                    "peoTotalComp": row["peoTotalComp"],
                    "peoActuallyPaidComp": row["peoActuallyPaidComp"],
                    "tsr": year.get("tsr"),
                    "netIncome": year.get("netIncome"),
                    "reason": None,
                }
            )
    return out
