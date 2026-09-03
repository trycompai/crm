import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    identity: str
    secret: str
    port: int
    data_dir: str
    max_search: int
    max_filings: int
    max_owner_filings: int
    max_owners: int
    max_insiders: int
    max_years: int
    max_tickers: int


def settings() -> Settings:
    return Settings(
        identity=os.environ.get("EDGAR_IDENTITY", "").strip(),
        secret=os.environ.get("EDGAR_SECRET", "").strip(),
        port=int(os.environ.get("EDGAR_PORT", "2100")),
        data_dir=os.environ.get("EDGAR_DATA_DIR", "").strip(),
        max_search=25,
        max_filings=100,
        max_owner_filings=60,
        max_owners=50,
        max_insiders=100,
        max_years=5,
        max_tickers=10,
    )
