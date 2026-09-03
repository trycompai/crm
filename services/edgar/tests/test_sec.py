from dataclasses import dataclass, field
from decimal import Decimal

import pandas as pd

from edgar_service import sec
from edgar_service.config import Settings
from edgar_service.values import day, number, text


@dataclass
class Person:
    name: str
    percent_of_class: float | None
    aggregate_amount: int | None = None
    sole_voting_power: int | None = None
    shared_voting_power: int | None = None


@dataclass
class Items:
    item4_purpose_of_transaction: str | None = None


@dataclass
class Schedule:
    reporting_persons: list
    items: Items = field(default_factory=Items)


@dataclass
class Filing:
    form: str
    filing_date: str
    accession_no: str
    homepage_url: str
    schedule: Schedule
    report_date: str | None = None
    primary_doc_description: str | None = None

    def obj(self):
        return self.schedule


class Listing:
    def __init__(self, filings):
        self.filings = filings
        self.empty = not filings

    def head(self, n):
        return self.filings[:n]

    def filter(self, **_):
        return self


class Entity:
    cik = 320193
    name = "Apple Inc."

    def __init__(self, filings):
        self.filings = filings

    def get_filings(self, form=None):
        return Listing(self.filings)


def configure():
    sec.configure(Settings("Test test@example.test", "", 2100, "", 25, 100, 60, 50, 100, 5, 10))


def test_values_fold_decimals_nan_and_dates():
    assert number(Decimal("74294811.0")) == 74294811.0
    assert number(float("nan")) is None
    assert number("[F1]") is None
    assert number("1,000") == 1000.0
    assert text("Net     Sales") == "Net Sales"
    assert day("2026-01-08T00:00:00") == "2026-01-08"
    assert day("bad") is None


def test_owners_keep_the_newest_filing_per_holder_and_apply_the_threshold(monkeypatch):
    configure()
    newest = Filing("SCHEDULE 13G/A", "2026-02-10", "a-1", "https://sec.test/a-1", Schedule([Person("Vanguard", 4.9, 1)]))
    older = Filing("SCHEDULE 13G", "2025-02-10", "a-0", "https://sec.test/a-0", Schedule([Person("Vanguard", 7.5, 2), Person("BlackRock", 6.1, 3, 10, 0)]))
    activist = Filing("SCHEDULE 13D", "2024-06-01", "d-1", "https://sec.test/d-1", Schedule([Person("Elliott", 5.5, 4)], Items("Seek board seats")))
    monkeypatch.setattr(sec, "_company", lambda key: Entity([newest, older, activist]))

    result = sec.owners("320193", 5, "all", 20)

    assert [o["filer"] for o in result["owners"]] == ["BlackRock", "Elliott"]
    assert result["owners"][1]["purpose"] == "Seek board seats"
    assert result["owners"][0]["purpose"] is None
    assert result["filingsRead"] == 3


def test_proxy_reads_the_tables(monkeypatch):
    configure()

    class Ratio:
        ceo_compensation = 74294811
        median_employee_compensation = 139483
        ratio = 533

    class Proposal:
        number = 1
        description = "Election of Directors"
        proposal_type = "director_election"

    class Statement:
        peo_name = "Mr. Cook"
        peo_total_comp = Decimal("74294811.0")
        peo_actually_paid_comp = Decimal("108423733.0")
        neo_avg_total_comp = Decimal("23812358.0")
        neo_avg_actually_paid_comp = Decimal("34125743.0")
        executive_compensation = pd.DataFrame(
            [
                {"fiscal_year_end": "2024-09-28", "peo_total_comp": 74609802.0, "peo_actually_paid_comp": 168980568.0, "neo_avg_total_comp": 27178896.0, "neo_avg_actually_paid_comp": 58633525.0},
                {"fiscal_year_end": "2025-09-27", "peo_total_comp": 74294811.0, "peo_actually_paid_comp": 108423733.0, "neo_avg_total_comp": 23812358.0, "neo_avg_actually_paid_comp": 34125743.0},
            ]
        )
        pay_vs_performance = pd.DataFrame(
            [{"fiscal_year_end": "2025-09-27", "peo_actually_paid_comp": 108423733.0, "neo_avg_actually_paid_comp": 34125743.0, "total_shareholder_return": 233.88, "peer_group_tsr": 279.51, "net_income": 112010000000.0, "company_selected_measure_value": 416161000000.0}]
        )
        summary_compensation_table = pd.DataFrame(
            [{"name": "Tim Cook", "title": "CEO", "year": 2025, "salary": 3000000, "bonus": None, "stock_awards": 57535293, "option_awards": None, "non_equity_incentive": 12000000, "pension_change": None, "other_compensation": 1759518, "total": 74294811}]
        )
        beneficial_ownership = pd.DataFrame([{"holder_name": "The Vanguard Group", "percent_of_class": 9.63}])
        voting_proposals = [Proposal()]
        performance_measures = ["Net     Sales", "Operating Income"]
        company_selected_measure = "Net Sales"
        ceo_pay_ratio = Ratio()
        insider_trading_policy_adopted = True

    class ProxyFiling(Filing):
        def obj(self):
            return Statement()

    filing = ProxyFiling("DEF 14A", "2026-01-08", "0001308179-26-000008", "https://sec.test/proxy", Schedule([]))
    monkeypatch.setattr(sec, "_company", lambda key: Entity([filing]))

    result = sec.proxy("320193", 1)

    assert result["peo"] == {"name": "Mr. Cook", "totalComp": 74294811.0, "actuallyPaidComp": 108423733.0}
    assert [row["fiscalYearEnd"] for row in result["compensationByYear"]] == ["2025-09-27"]
    assert result["executives"][0]["name"] == "Tim Cook"
    assert result["executives"][0]["bonus"] is None
    assert result["holders"] == [{"name": "The Vanguard Group", "percentOfClass": 9.63, "shares": None}]
    assert result["proposals"][0]["type"] == "director_election"
    assert result["performanceMeasures"] == ["Net Sales", "Operating Income"]
    assert result["ceoPayRatio"]["ratio"] == 533.0
    assert result["insiderTradingPolicyAdopted"] is True


def test_proxy_without_a_filing_is_not_found(monkeypatch):
    configure()
    monkeypatch.setattr(sec, "_company", lambda key: Entity([]))
    try:
        sec.proxy("320193", 1)
    except sec.NotFound as error:
        assert "No DEF 14A" in str(error)
    else:
        raise AssertionError("expected NotFound")
