"""
Commentary service — generates plain-English portfolio summaries using Claude.
Called by GET /api/analytics/commentary.
Falls back gracefully when ANTHROPIC_API_KEY is not set.

Requires:
  pip install anthropic
  ANTHROPIC_API_KEY set in .env
"""

from __future__ import annotations

from datetime import datetime, timezone

from loguru import logger

from app.core.config import settings

# Model used for commentary: fast and cheap Haiku model
_MODEL = "claude-haiku-4-5-20251001"

# ── Null response helper ──────────────────────────────────────────────────────

def _null_response() -> dict:
    """Return the disabled/error response shape."""
    return {"commentary": None, "generated_at": None, "model": None}


# ── Prompt builder ────────────────────────────────────────────────────────────

def _build_prompt(summary: dict, pnl: list[dict]) -> str:
    """
    Construct a concise prompt describing the portfolio state.

    summary keys used: equity, starting_cash, total_return, win_rate, n_trades
    pnl items used:    symbol, realized_pnl (top 2 winners and losers)
    """
    equity       = summary.get("equity", 0.0)
    starting     = summary.get("starting_cash", 100_000.0)
    total_return = summary.get("total_return", 0.0) * 100   # convert to %
    win_rate     = summary.get("win_rate", 0.0) * 100        # convert to %
    n_trades     = summary.get("n_trades", 0)

    # Sort attribution by realized P&L to find top winners and losers
    sorted_pnl = sorted(pnl, key=lambda x: x.get("realized_pnl", 0.0), reverse=True)
    winners = sorted_pnl[:2]
    losers  = list(reversed(sorted_pnl))[:2]

    def fmt_sym(items: list[dict], positive: bool) -> str:
        parts = []
        for item in items:
            sym = item.get("symbol", "?")
            pnl_val = item.get("realized_pnl", 0.0)
            sign = "+" if pnl_val >= 0 else ""
            parts.append(f"{sym} ({sign}${pnl_val:,.2f})")
        return ", ".join(parts) if parts else "none"

    winners_str = fmt_sym(winners, positive=True)
    losers_str  = fmt_sym(losers,  positive=False)

    return (
        f"You are a friendly portfolio advisor summarizing a paper trading account.\n\n"
        f"Portfolio snapshot:\n"
        f"- Current equity: ${equity:,.2f} (started at ${starting:,.2f})\n"
        f"- Total return: {total_return:+.2f}%\n"
        f"- Win rate: {win_rate:.1f}% over {n_trades} completed trade(s)\n"
        f"- Top 2 winning positions by realized P&L: {winners_str}\n"
        f"- Top 2 losing positions by realized P&L: {losers_str}\n\n"
        f"Write 2–3 sentences in plain English summarizing this portfolio's performance "
        f"like a knowledgeable but friendly financial advisor. "
        f"Mention notable winners or losers if relevant. "
        f"Be encouraging but honest. Do not use jargon."
    )


# ── Main public function ──────────────────────────────────────────────────────

async def generate_commentary(summary: dict, pnl: list[dict]) -> dict:
    """
    Generate a plain-English portfolio commentary using Claude.

    Returns:
        {
            "commentary":   str | None,
            "generated_at": ISO timestamp | None,
            "model":        str | None,
        }

    If ANTHROPIC_API_KEY is not configured, or any error occurs,
    returns null commentary without raising.
    """
    if not settings.ANTHROPIC_API_KEY:
        logger.debug("ANTHROPIC_API_KEY not set — commentary disabled")
        return _null_response()

    try:
        import anthropic  # imported lazily so the service loads even without the package

        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        prompt = _build_prompt(summary, pnl)

        message = client.messages.create(
            model=_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )

        # Extract text from the first content block
        commentary_text = message.content[0].text if message.content else ""
        generated_at    = datetime.now(timezone.utc).isoformat()

        logger.info(f"Commentary generated ({len(commentary_text)} chars) via {_MODEL}")
        return {
            "commentary":   commentary_text,
            "generated_at": generated_at,
            "model":        _MODEL,
        }

    except ImportError:
        logger.warning("anthropic package not installed — run: pip install anthropic")
        return _null_response()
    except Exception as exc:
        # Catch auth errors, rate limits, network issues, etc.
        logger.warning(f"Commentary generation failed: {exc}")
        return _null_response()
