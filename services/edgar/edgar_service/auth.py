import hmac

from fastapi import HTTPException, Request

from .config import settings

LOOPBACK = {"127.0.0.1", "::1", "localhost"}


def require_secret(request: Request) -> None:
    secret = settings().secret
    if not secret:
        host = request.client.host if request.client else ""
        if host in LOOPBACK:
            return
        raise HTTPException(
            status_code=401,
            detail={"reason": "EDGAR_SECRET is not set, so only loopback callers are accepted."},
        )

    header = request.headers.get("authorization", "")
    given = header[7:].strip() if header.lower().startswith("bearer ") else ""
    if not given or not hmac.compare_digest(given, secret):
        raise HTTPException(status_code=401, detail={"reason": "Bad or missing bearer secret."})
