import json
import os
import sys

if os.environ.get("EDGAR_LIVE") != "1":
    print("Set EDGAR_LIVE=1 to run the live smoke test.")
    sys.exit(0)

from edgar_service import sec
from edgar_service.config import settings

sec.configure(settings())
if not sec.identity_set():
    print("EDGAR_IDENTITY is required.")
    sys.exit(1)

checks = {
    "search": lambda: sec.search_companies("Apple", 3),
    "company": lambda: sec.company("320193"),
    "filings": lambda: sec.filings("320193", "DEF 14A", None, None, 3),
    "search_filings": lambda: sec.search_filings("Apple", "DEF 14A", "2025-01-01", None, 3),
    "owners": lambda: sec.owners("320193", 5, "all", 5),
    "insiders": lambda: sec.insiders("320193", 3),
    "proxy": lambda: sec.proxy("320193", 2),
    "compare": lambda: sec.compare(["AAPL", "MSFT"], 1),
}

failed = 0
for name, run in checks.items():
    try:
        result = run()
        print(f"ok   {name}: {json.dumps(result, default=str)[:160]}")
    except Exception as error:
        failed += 1
        print(f"FAIL {name}: {error}")

sys.exit(1 if failed else 0)
