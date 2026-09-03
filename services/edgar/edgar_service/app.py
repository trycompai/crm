from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse

from . import VERSION, sec
from .auth import require_secret
from .config import settings


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    sec.configure(settings())
    yield


app = FastAPI(title="CRM EDGAR service", version=VERSION, docs_url=None, redoc_url=None, lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_error(_: Request, error: HTTPException) -> JSONResponse:
    detail = error.detail if isinstance(error.detail, dict) else {"reason": str(error.detail)}
    return JSONResponse(status_code=error.status_code, content=detail)


@app.exception_handler(sec.NotFound)
async def not_found(_: Request, error: sec.NotFound) -> JSONResponse:
    return JSONResponse(status_code=404, content={"reason": str(error)})


@app.exception_handler(sec.Upstream)
async def upstream(_: Request, error: sec.Upstream) -> JSONResponse:
    return JSONResponse(status_code=502, content={"reason": str(error)})


@app.exception_handler(Exception)
async def unexpected(_: Request, error: Exception) -> JSONResponse:
    return JSONResponse(status_code=502, content={"reason": f"SEC lookup failed: {error}"})


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "version": VERSION,
        "edgartools": sec.edgartools_version(),
        "identitySet": sec.identity_set(),
    }


guarded = [Depends(require_secret)]


@app.get("/companies/search", dependencies=guarded)
def companies_search(q: str = Query(min_length=1), limit: int = Query(10, ge=1, le=settings().max_search)) -> dict:
    return {"companies": sec.search_companies(q, limit)}


@app.get("/companies/{key}", dependencies=guarded)
def company(key: str) -> dict:
    return sec.company(key)


@app.get("/companies/{key}/filings", dependencies=guarded)
def company_filings(
    key: str,
    form: str | None = None,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    limit: int = Query(20, ge=1, le=settings().max_filings),
) -> dict:
    return sec.filings(key, form, from_, to, limit)


@app.get("/filings/search", dependencies=guarded)
def filings_search(
    q: str = Query(min_length=2),
    form: str | None = None,
    from_: str | None = Query(None, alias="from"),
    to: str | None = None,
    limit: int = Query(20, ge=1, le=settings().max_filings),
) -> dict:
    return sec.search_filings(q, form, from_, to, limit)


@app.get("/companies/{key}/owners", dependencies=guarded)
def company_owners(
    key: str,
    minPercent: float = Query(5, ge=0, le=100),
    form: str = Query("all", pattern="^(13D|13G|all)$"),
    limit: int = Query(20, ge=1, le=settings().max_owners),
) -> dict:
    return sec.owners(key, minPercent, form, limit)


@app.get("/companies/{key}/insiders", dependencies=guarded)
def company_insiders(key: str, limit: int = Query(20, ge=1, le=settings().max_insiders)) -> dict:
    return sec.insiders(key, limit)


@app.get("/companies/{key}/proxy", dependencies=guarded)
def company_proxy(key: str, years: int = Query(3, ge=1, le=settings().max_years)) -> dict:
    return sec.proxy(key, years)


@app.get("/compensation/compare", dependencies=guarded)
def compensation_compare(
    tickers: str = Query(min_length=1),
    years: int = Query(3, ge=1, le=settings().max_years),
) -> dict:
    names = [t.strip().upper() for t in tickers.split(",") if t.strip()]
    if not names:
        raise HTTPException(status_code=422, detail={"reason": "Give at least one ticker."})
    if len(names) > settings().max_tickers:
        raise HTTPException(status_code=422, detail={"reason": f"At most {settings().max_tickers} tickers."})
    return {"rows": sec.compare(names, years)}
