from edgar_service import sec
from tests.conftest import AUTH


def test_health_is_open(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True, "version": "0.1.0", "edgartools": "5.56.0", "identitySet": True}


def test_routes_need_the_secret(client):
    assert client.get("/companies/search?q=apple").status_code == 401
    assert client.get("/companies/search?q=apple", headers={"authorization": "Bearer wrong"}).status_code == 401


def test_search_returns_matches(client, monkeypatch):
    monkeypatch.setattr(sec, "search_companies", lambda q, limit: [{"cik": "320193", "name": "Apple Inc.", "ticker": "AAPL", "exchange": "Nasdaq"}])
    response = client.get("/companies/search?q=apple&limit=3", headers=AUTH)
    assert response.status_code == 200
    assert response.json()["companies"][0]["ticker"] == "AAPL"


def test_not_found_is_404_with_a_reason(client, monkeypatch):
    def missing(key):
        raise sec.NotFound(f"No SEC filer matches {key}.")

    monkeypatch.setattr(sec, "company", missing)
    response = client.get("/companies/ZZZZ", headers=AUTH)
    assert response.status_code == 404
    assert response.json() == {"reason": "No SEC filer matches ZZZZ."}


def test_upstream_failure_is_502(client, monkeypatch):
    def broken(key, form, start, end, limit):
        raise sec.Upstream("SEC filings lookup failed: boom")

    monkeypatch.setattr(sec, "filings", broken)
    response = client.get("/companies/320193/filings?form=10-K", headers=AUTH)
    assert response.status_code == 502
    assert "boom" in response.json()["reason"]


def test_compare_splits_and_bounds_tickers(client, monkeypatch):
    seen = {}

    def compare(tickers, years):
        seen["tickers"] = tickers
        seen["years"] = years
        return []

    monkeypatch.setattr(sec, "compare", compare)
    response = client.get("/compensation/compare?tickers=aapl,%20msft&years=2", headers=AUTH)
    assert response.status_code == 200
    assert seen == {"tickers": ["AAPL", "MSFT"], "years": 2}

    too_many = ",".join(f"T{i}" for i in range(11))
    assert client.get(f"/compensation/compare?tickers={too_many}", headers=AUTH).status_code == 422


def test_any_other_failure_is_502(client, monkeypatch):
    def broken(key):
        raise RuntimeError("connection refused")

    monkeypatch.setattr(sec, "company", broken)
    response = client.get("/companies/320193", headers=AUTH)
    assert response.status_code == 502
    assert "connection refused" in response.json()["reason"]
