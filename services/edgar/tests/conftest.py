import os

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault("EDGAR_IDENTITY", "Test Runner test@example.test")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("EDGAR_SECRET", "s3cret")
    from edgar_service import sec
    from edgar_service.app import app

    monkeypatch.setattr(sec, "identity_set", lambda: True)
    monkeypatch.setattr(sec, "edgartools_version", lambda: "5.56.0")
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


AUTH = {"authorization": "Bearer s3cret"}
