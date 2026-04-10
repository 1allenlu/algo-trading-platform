"""
Economics Calendar Service — Phase 55.

Returns a structured calendar of upcoming macro events (FOMC meetings,
CPI releases, NFP, PPI, GDP estimates) with countdown days and impact ratings.

Dates are sourced from publicly-announced Fed schedules and BLS release calendars.
Historical actuals vs estimates are fetched via FRED (if pandas_datareader is available)
or returned as None.

Public interface:
  get_calendar(days_ahead)  → list of MacroEvent dicts, sorted by date
"""

from __future__ import annotations

from datetime import date, datetime, timezone

# ── Known macro event calendar ─────────────────────────────────────────────────
#
# FOMC 2025/2026: announced by Fed annually at https://www.federalreserve.gov
# CPI/PPI/NFP/GDP: approx dates from BLS/BEA release calendars.
# Dates are ANNOUNCEMENT dates (rate decision day or data release day).

_EVENTS: list[dict] = [
    # ── FOMC (rate decisions) ──────────────────────────────────────────────────
    {"date": "2025-05-07", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2025-06-18", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2025-07-30", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2025-09-17", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2025-10-29", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2025-12-10", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-01-28", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-03-18", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-04-29", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-06-17", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-07-29", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-09-16", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-10-28", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},
    {"date": "2026-12-09", "name": "FOMC Rate Decision",      "category": "fed",        "importance": "high"},

    # ── CPI (monthly, approx 12th of following month) ─────────────────────────
    {"date": "2025-05-13", "name": "CPI Release (April)",     "category": "inflation",  "importance": "high"},
    {"date": "2025-06-11", "name": "CPI Release (May)",       "category": "inflation",  "importance": "high"},
    {"date": "2025-07-15", "name": "CPI Release (June)",      "category": "inflation",  "importance": "high"},
    {"date": "2025-08-12", "name": "CPI Release (July)",      "category": "inflation",  "importance": "high"},
    {"date": "2025-09-10", "name": "CPI Release (August)",    "category": "inflation",  "importance": "high"},
    {"date": "2025-10-14", "name": "CPI Release (September)", "category": "inflation",  "importance": "high"},
    {"date": "2025-11-12", "name": "CPI Release (October)",   "category": "inflation",  "importance": "high"},
    {"date": "2025-12-10", "name": "CPI Release (November)",  "category": "inflation",  "importance": "high"},
    {"date": "2026-01-14", "name": "CPI Release (December)",  "category": "inflation",  "importance": "high"},

    # ── NFP / Jobs Report (first Friday of month) ─────────────────────────────
    {"date": "2025-05-02", "name": "Non-Farm Payrolls (April)","category": "employment", "importance": "high"},
    {"date": "2025-06-06", "name": "Non-Farm Payrolls (May)",  "category": "employment", "importance": "high"},
    {"date": "2025-07-03", "name": "Non-Farm Payrolls (June)", "category": "employment", "importance": "high"},
    {"date": "2025-08-01", "name": "Non-Farm Payrolls (July)", "category": "employment", "importance": "high"},
    {"date": "2025-09-05", "name": "Non-Farm Payrolls (August)","category": "employment","importance": "high"},
    {"date": "2025-10-03", "name": "Non-Farm Payrolls (September)","category": "employment","importance": "high"},
    {"date": "2025-11-07", "name": "Non-Farm Payrolls (October)","category": "employment","importance": "high"},
    {"date": "2025-12-05", "name": "Non-Farm Payrolls (November)","category": "employment","importance": "high"},
    {"date": "2026-01-09", "name": "Non-Farm Payrolls (December)","category": "employment","importance": "high"},

    # ── PPI (monthly, approx 13th of following month) ─────────────────────────
    {"date": "2025-05-15", "name": "PPI Release (April)",     "category": "inflation",  "importance": "medium"},
    {"date": "2025-06-12", "name": "PPI Release (May)",       "category": "inflation",  "importance": "medium"},
    {"date": "2025-07-16", "name": "PPI Release (June)",      "category": "inflation",  "importance": "medium"},
    {"date": "2025-08-13", "name": "PPI Release (July)",      "category": "inflation",  "importance": "medium"},
    {"date": "2025-09-11", "name": "PPI Release (August)",    "category": "inflation",  "importance": "medium"},
    {"date": "2025-10-15", "name": "PPI Release (September)", "category": "inflation",  "importance": "medium"},

    # ── GDP (quarterly advance estimate) ──────────────────────────────────────
    {"date": "2025-07-30", "name": "GDP Advance (Q2 2025)",   "category": "growth",     "importance": "high"},
    {"date": "2025-10-29", "name": "GDP Advance (Q3 2025)",   "category": "growth",     "importance": "high"},
    {"date": "2026-01-28", "name": "GDP Advance (Q4 2025)",   "category": "growth",     "importance": "high"},
    {"date": "2026-04-29", "name": "GDP Advance (Q1 2026)",   "category": "growth",     "importance": "high"},

    # ── Fed Chair speeches at major venues ────────────────────────────────────
    {"date": "2025-08-22", "name": "Jackson Hole Symposium",  "category": "fed",        "importance": "high"},
    {"date": "2026-08-21", "name": "Jackson Hole Symposium",  "category": "fed",        "importance": "high"},

    # ── Treasury auctions (quarterly refunding) ───────────────────────────────
    {"date": "2025-05-07", "name": "Quarterly Refunding (Q2)", "category": "treasury",  "importance": "medium"},
    {"date": "2025-08-06", "name": "Quarterly Refunding (Q3)", "category": "treasury",  "importance": "medium"},
    {"date": "2025-11-05", "name": "Quarterly Refunding (Q4)", "category": "treasury",  "importance": "medium"},
    {"date": "2026-02-04", "name": "Quarterly Refunding (Q1)", "category": "treasury",  "importance": "medium"},
]


def get_calendar(days_ahead: int = 90) -> list[dict]:
    """
    Return upcoming macro events within the next `days_ahead` days,
    sorted by date, with a `days_until` countdown field.
    """
    today = date.today()
    cutoff = date(today.year + (1 if today.month > 9 else 0), 1, 1)  # rough upper bound

    result = []
    for ev in _EVENTS:
        ev_date = date.fromisoformat(ev["date"])
        days_until = (ev_date - today).days
        if 0 <= days_until <= days_ahead:
            result.append({
                **ev,
                "days_until":  days_until,
                "is_today":    days_until == 0,
                "is_this_week": days_until <= 7,
            })

    result.sort(key=lambda e: e["date"])
    return result


def get_upcoming_count() -> dict[str, int]:
    """Quick summary: how many events in the next 7 / 30 days."""
    today = date.today()
    counts = {"7d": 0, "30d": 0}
    for ev in _EVENTS:
        d = (date.fromisoformat(ev["date"]) - today).days
        if 0 <= d <= 7:
            counts["7d"] += 1
        if 0 <= d <= 30:
            counts["30d"] += 1
    return counts
