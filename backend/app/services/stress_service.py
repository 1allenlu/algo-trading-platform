"""
Scenario Stress Testing — Phase 79.

Applies historical-crisis shocks to a portfolio of positions and reports
the estimated P&L impact per position and in aggregate.

Built-in scenarios:
  gfc2008    2008 Global Financial Crisis  (S&P -57%)
  covid2020  COVID-19 Flash Crash          (S&P -34%)
  rate2022   2022 Rate-Shock Bear Market   (S&P -20%, NASDAQ -33%)
  dotcom2000 Dot-Com Bust                  (S&P -49%, NASDAQ -78%)
  custom     User-supplied flat shock

Shock application:
  Each scenario defines a market-level shock and sector-specific overrides.
  Position impact = market_value × effective_shock
  where effective_shock = sector_shock if symbol's sector is known else market_shock.
"""
from __future__ import annotations

SCENARIOS: dict[str, dict] = {
    "gfc2008": {
        "id":          "gfc2008",
        "name":        "2008 Global Financial Crisis",
        "description": "Oct 2007 – Mar 2009.  S&P 500 −57 %, financials −80 %.",
        "market_shock": -0.57,
        "sector_shocks": {
            "XLF": -0.80, "XLK": -0.65, "XLY": -0.55,
            "XLE": -0.60, "XLV": -0.30, "XLU": -0.35,
            "XLB": -0.55, "XLI": -0.55, "XLP": -0.25,
            "XLC": -0.60, "XLRE": -0.70,
        },
    },
    "covid2020": {
        "id":          "covid2020",
        "name":        "COVID-19 Crash",
        "description": "Feb 19 – Mar 23, 2020.  S&P 500 −34 % in 33 days.",
        "market_shock": -0.34,
        "sector_shocks": {
            "XLE": -0.60, "XLY": -0.40, "XLF": -0.42,
            "XLK": -0.28, "XLV": -0.15, "XLP": -0.20,
            "XLU": -0.25, "XLRE": -0.28,
        },
    },
    "rate2022": {
        "id":          "rate2022",
        "name":        "2022 Rate-Shock Bear Market",
        "description": "Jan – Dec 2022.  S&P −20 %, NASDAQ −33 %, bonds −13 %.",
        "market_shock": -0.20,
        "sector_shocks": {
            "XLK": -0.33, "XLC": -0.40, "XLRE": -0.28,
            "XLF": -0.12, "XLE":  0.58,
            "XLV": -0.05, "XLU": -0.01,
        },
    },
    "dotcom2000": {
        "id":          "dotcom2000",
        "name":        "Dot-Com Bust",
        "description": "Mar 2000 – Oct 2002.  S&P −49 %, NASDAQ −78 %.",
        "market_shock": -0.49,
        "sector_shocks": {
            "XLK": -0.78, "XLC": -0.65, "XLY": -0.40,
            "XLF": -0.30, "XLV": -0.20,
        },
    },
}

# Hardcoded ticker → sector-ETF mapping for common names
TICKER_SECTOR: dict[str, str] = {
    # Technology (XLK)
    "AAPL": "XLK", "MSFT": "XLK", "NVDA": "XLK", "AMD": "XLK",
    "INTC": "XLK", "ORCL": "XLK", "CRM": "XLK", "AVGO": "XLK",
    "QCOM": "XLK", "TXN": "XLK",
    # Communication (XLC)
    "GOOGL": "XLC", "GOOG": "XLC", "META": "XLC", "NFLX": "XLC",
    "DIS": "XLC", "CMCSA": "XLC", "T": "XLC", "VZ": "XLC",
    # Consumer Discretionary (XLY)
    "AMZN": "XLY", "TSLA": "XLY", "MCD": "XLY", "SBUX": "XLY",
    "HD": "XLY", "LOW": "XLY", "NKE": "XLY", "BKNG": "XLY",
    # Consumer Staples (XLP)
    "WMT": "XLP", "PG": "XLP", "KO": "XLP", "PEP": "XLP",
    "COST": "XLP", "MDLZ": "XLP", "PM": "XLP",
    # Financials (XLF)
    "JPM": "XLF", "BAC": "XLF", "GS": "XLF", "MS": "XLF",
    "WFC": "XLF", "C": "XLF", "V": "XLF", "MA": "XLF",
    "BRK-B": "XLF", "AXP": "XLF",
    # Healthcare (XLV)
    "JNJ": "XLV", "LLY": "XLV", "UNH": "XLV", "ABBV": "XLV",
    "MRK": "XLV", "PFE": "XLV", "ABT": "XLV", "TMO": "XLV",
    # Energy (XLE)
    "XOM": "XLE", "CVX": "XLE", "COP": "XLE", "SLB": "XLE",
    "EOG": "XLE",
    # Industrials (XLI)
    "GE": "XLI", "HON": "XLI", "CAT": "XLI", "BA": "XLI",
    "UPS": "XLI", "RTX": "XLI", "DE": "XLI",
    # Materials (XLB)
    "LIN": "XLB", "FCX": "XLB", "NEM": "XLB", "APD": "XLB",
    # Utilities (XLU)
    "NEE": "XLU", "DUK": "XLU", "SO": "XLU", "D": "XLU",
    # Real Estate (XLRE)
    "AMT": "XLRE", "PLD": "XLRE", "EQIX": "XLRE", "SPG": "XLRE",
    # Index ETFs — market-level exposure
    "SPY": "market", "IWM": "market", "DIA": "market",
    "QQQ": "XLK",
    # Gold / Silver / Bonds
    "GLD": "gold", "SLV": "silver",
    "TLT": "bonds", "IEF": "bonds", "AGG": "bonds",
    # Crypto proxies (very high beta; treat as tech-level shock)
    "BTC-USD": "XLK", "ETH-USD": "XLK", "COIN": "XLK",
}


def list_scenarios() -> list[dict]:
    return [
        {k: v for k, v in s.items() if k != "sector_shocks"}
        for s in SCENARIOS.values()
    ]


def run_stress_test(
    scenario_id: str,
    positions: list[dict],
    custom_shock: float | None = None,
) -> dict:
    """
    Apply scenario shocks to a list of positions.

    positions: [{symbol, qty, current_price, market_value}]
    custom_shock: optional flat shock fraction (e.g. -0.20 = -20%); overrides scenario

    Returns per-position impacts + aggregate summary.
    """
    if scenario_id == "custom":
        shock = custom_shock if custom_shock is not None else -0.20
        scenario = {
            "name": f"Custom Shock ({shock*100:+.1f}%)",
            "description": "User-defined uniform market shock.",
            "market_shock": shock,
            "sector_shocks": {},
        }
    else:
        scenario = SCENARIOS.get(scenario_id)
        if not scenario:
            raise ValueError(f"Unknown scenario: {scenario_id}")

    market_shock   = scenario["market_shock"]
    sector_shocks  = scenario.get("sector_shocks", {})

    results = []
    total_value  = 0.0
    total_impact = 0.0

    for pos in positions:
        sym   = pos.get("symbol", "").upper()
        qty   = float(pos.get("qty", 0))
        price = float(pos.get("current_price", 0))
        mval  = float(pos.get("market_value") or price * qty)

        sector = TICKER_SECTOR.get(sym)
        effective_shock = sector_shocks.get(sector, market_shock) if sector else market_shock

        impact = mval * effective_shock
        total_value  += mval
        total_impact += impact

        results.append({
            "symbol":          sym,
            "qty":             qty,
            "current_price":   price,
            "market_value":    round(mval, 2),
            "sector":          sector or "Unknown",
            "applied_shock":   round(effective_shock * 100, 1),
            "impact_dollar":   round(impact, 2),
            "impact_pct":      round(effective_shock * 100, 1),
            "stressed_value":  round(mval + impact, 2),
        })

    # Sort by absolute impact descending
    results.sort(key=lambda r: abs(r["impact_dollar"]), reverse=True)

    return {
        "scenario_id":         scenario_id,
        "scenario_name":       scenario["name"],
        "scenario_description": scenario["description"],
        "market_shock_pct":    round(market_shock * 100, 1),
        "total_portfolio_value":  round(total_value, 2),
        "total_impact_dollar":    round(total_impact, 2),
        "total_impact_pct":       round(total_impact / total_value * 100, 2) if total_value else 0.0,
        "stressed_portfolio_value": round(total_value + total_impact, 2),
        "positions": results,
    }
