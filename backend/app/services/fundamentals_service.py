"""
Fundamentals Service — Phase 40.

Fetches key fundamental data for a stock ticker via yfinance .info.
Data is 15-min delayed for free tier — suitable for screening, not HFT.

Public function:
  get_fundamentals(symbol) → dict with P/E, EPS, revenue, market cap, etc.
"""

from __future__ import annotations

import yfinance as yf
from loguru import logger


def _safe_float(val: object) -> float | None:
    """Convert value to float, return None on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _safe_int(val: object) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def get_fundamentals(symbol: str) -> dict:
    """
    Fetch fundamental data for a ticker symbol.

    Returns a dict with the following keys (all may be None if unavailable):
      pe_ratio, forward_pe, pb_ratio, ps_ratio, peg_ratio
      eps_ttm, eps_forward, revenue_ttm, gross_profit
      market_cap, enterprise_value
      dividend_yield, beta
      52w_high, 52w_low
      sector, industry, company_name
    """
    try:
        ticker = yf.Ticker(symbol.upper())
        info   = ticker.info or {}

        return {
            "symbol":           symbol.upper(),
            "company_name":     info.get("longName") or info.get("shortName"),
            "sector":           info.get("sector"),
            "industry":         info.get("industry"),
            # Valuation
            "pe_ratio":         _safe_float(info.get("trailingPE")),
            "forward_pe":       _safe_float(info.get("forwardPE")),
            "pb_ratio":         _safe_float(info.get("priceToBook")),
            "ps_ratio":         _safe_float(info.get("priceToSalesTrailing12Months")),
            "peg_ratio":        _safe_float(info.get("pegRatio")),
            "ev_ebitda":        _safe_float(info.get("enterpriseToEbitda")),
            # Earnings
            "eps_ttm":          _safe_float(info.get("trailingEps")),
            "eps_forward":      _safe_float(info.get("forwardEps")),
            # Income
            "revenue_ttm":      _safe_float(info.get("totalRevenue")),
            "gross_profit":     _safe_float(info.get("grossProfits")),
            "ebitda":           _safe_float(info.get("ebitda")),
            "profit_margin":    _safe_float(info.get("profitMargins")),
            "revenue_growth":   _safe_float(info.get("revenueGrowth")),
            "earnings_growth":  _safe_float(info.get("earningsGrowth")),
            # Size
            "market_cap":       _safe_float(info.get("marketCap")),
            "enterprise_value": _safe_float(info.get("enterpriseValue")),
            "shares_outstanding": _safe_float(info.get("sharesOutstanding")),
            # Returns / risk
            "dividend_yield":   _safe_float(info.get("dividendYield")),
            "beta":             _safe_float(info.get("beta")),
            # 52-week range
            "week52_high":      _safe_float(info.get("fiftyTwoWeekHigh")),
            "week52_low":       _safe_float(info.get("fiftyTwoWeekLow")),
            # Price targets
            "target_mean_price": _safe_float(info.get("targetMeanPrice")),
            "analyst_count":     _safe_int(info.get("numberOfAnalystOpinions")),
            "recommendation":    info.get("recommendationKey"),
        }
    except Exception as exc:
        logger.warning(f"[fundamentals] get_fundamentals({symbol}) failed: {exc}")
        return {"symbol": symbol.upper(), "error": str(exc)}
