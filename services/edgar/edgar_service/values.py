import math
from datetime import date, datetime
from decimal import Decimal
from typing import Any


def number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        value = float(value)
    if isinstance(value, (int, float)):
        return None if isinstance(value, float) and math.isnan(value) else float(value)
    try:
        parsed = float(str(value).replace(",", "").replace("$", "").strip())
    except ValueError:
        return None
    return None if math.isnan(parsed) else parsed


def whole(value: Any) -> int | None:
    parsed = number(value)
    return None if parsed is None else int(parsed)


def text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    cleaned = " ".join(str(value).split())
    return cleaned or None


def day(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    cleaned = str(value).strip()[:10]
    try:
        return date.fromisoformat(cleaned).isoformat()
    except ValueError:
        return None


def rows(frame: Any) -> list[dict[str, Any]]:
    if frame is None:
        return []
    to_dict = getattr(frame, "to_dict", None)
    if to_dict is None:
        return []
    try:
        return list(to_dict("records"))
    except (TypeError, ValueError):
        return []


def cik_text(value: Any) -> str:
    return str(value).strip().lstrip("0") or "0"
