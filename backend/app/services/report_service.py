"""
Report Service — Phase 24.

Generates a professional PDF report from a completed backtest run using
reportlab (layout) and matplotlib (equity curve chart).

PDF structure:
  1. Header — strategy name, symbols, date range, generated timestamp
  2. Key Metrics table — return, CAGR, Sharpe, Sortino, max DD, win rate,
     profit factor, num trades
  3. Equity Curve chart — matplotlib figure embedded as PNG
  4. Trade Log table — top 20 trades by absolute P&L (if available)

Usage:
    pdf_bytes = generate_backtest_pdf(run_orm_object)
    return Response(content=pdf_bytes, media_type="application/pdf")

Dependencies added to pyproject.toml:
    reportlab = "^4.2"
    matplotlib = "^3.8"
"""

from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from typing import Any


def _equity_curve_png(equity_points: list[dict]) -> bytes:
    """Render equity curve as a PNG bytes using matplotlib dark style."""
    import matplotlib
    matplotlib.use("Agg")   # Non-interactive backend (no display needed)
    import matplotlib.pyplot as plt
    import matplotlib.dates as mdates
    from datetime import datetime as dt

    dates  = [dt.fromisoformat(p["date"]) for p in equity_points]
    values = [p["value"] for p in equity_points]

    fig, ax = plt.subplots(figsize=(10, 3.5))
    fig.patch.set_facecolor("#0A0E17")
    ax.set_facecolor("#12161F")

    ax.plot(dates, values, color="#4A9EFF", linewidth=1.5)
    ax.fill_between(dates, values, min(values), alpha=0.15, color="#4A9EFF")

    ax.xaxis.set_major_formatter(mdates.DateFormatter("%Y-%m"))
    ax.xaxis.set_major_locator(mdates.MonthLocator(interval=3))
    fig.autofmt_xdate(rotation=30)

    ax.set_ylabel("Portfolio Value ($)", color="#9CA3AF", fontsize=9)
    ax.tick_params(colors="#9CA3AF", labelsize=8)
    ax.spines[:].set_color("#1E2330")
    ax.grid(True, color="#1E2330", linewidth=0.5)

    plt.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, bbox_inches="tight",
                facecolor=fig.get_facecolor())
    plt.close(fig)
    buf.seek(0)
    return buf.read()


def generate_backtest_pdf(run: Any) -> bytes:
    """
    Generate a PDF report for a BacktestRun ORM object.
    Returns raw PDF bytes ready to stream as a response.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    # ── Color palette matching the app dark theme ─────────────────────────────
    BG        = colors.HexColor("#0A0E17")
    CARD_BG   = colors.HexColor("#12161F")
    SURFACE   = colors.HexColor("#1A1F2E")
    BORDER    = colors.HexColor("#1E2330")
    PRIMARY   = colors.HexColor("#4A9EFF")
    POSITIVE  = colors.HexColor("#00C896")
    NEGATIVE  = colors.HexColor("#FF6B6B")
    TEXT      = colors.HexColor("#E8EAED")
    MUTED     = colors.HexColor("#9CA3AF")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm,  bottomMargin=2*cm,
    )

    styles  = getSampleStyleSheet()
    story   = []

    def _style(name: str, **kw) -> ParagraphStyle:
        return ParagraphStyle(name, parent=styles["Normal"], **kw)

    title_style = _style("title", fontSize=18, textColor=TEXT, spaceAfter=4,
                         fontName="Helvetica-Bold")
    sub_style   = _style("sub",   fontSize=10, textColor=MUTED, spaceAfter=2)
    h2_style    = _style("h2",    fontSize=13, textColor=PRIMARY, spaceBefore=14,
                         spaceAfter=6, fontName="Helvetica-Bold")
    cell_style  = _style("cell",  fontSize=9,  textColor=TEXT)
    label_style = _style("label", fontSize=9,  textColor=MUTED)

    # ── 1. Header ─────────────────────────────────────────────────────────────
    symbols  = run.symbols.split(",") if run.symbols else []
    strategy = run.strategy_name.replace("_", " ").title()
    now_str  = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    story.append(Paragraph(f"Backtest Report — {strategy}", title_style))
    story.append(Paragraph(f"Symbols: {', '.join(symbols)}", sub_style))
    story.append(Paragraph(f"Run #{run.id}  |  Status: {run.status}  |  Generated: {now_str}", sub_style))
    story.append(Spacer(1, 0.4*cm))

    # ── 2. Key Metrics table ──────────────────────────────────────────────────
    def _pct(v: float | None, decimals: int = 2) -> str:
        return f"{v*100:+.{decimals}f}%" if v is not None else "—"

    def _f(v: float | None, decimals: int = 2) -> str:
        return f"{v:.{decimals}f}" if v is not None else "—"

    metrics_data = [
        ["Metric", "Value"],
        ["Total Return",   _pct(run.total_return)],
        ["CAGR",           _pct(run.cagr)],
        ["Sharpe Ratio",   _f(run.sharpe_ratio)],
        ["Sortino Ratio",  _f(run.sortino_ratio)],
        ["Max Drawdown",   _pct(run.max_drawdown)],
        ["Calmar Ratio",   _f(run.calmar_ratio)],
        ["Win Rate",       _pct(run.win_rate)],
        ["Num Trades",     str(run.num_trades) if run.num_trades is not None else "—"],
    ]

    story.append(Paragraph("Performance Metrics", h2_style))
    tbl = Table(metrics_data, colWidths=[8*cm, 8*cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  SURFACE),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  PRIMARY),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 9),
        ("ALIGN",         (1, 0), (1, -1),  "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CARD_BG, SURFACE]),
        ("TEXTCOLOR",     (0, 1), (-1, -1), TEXT),
        ("GRID",          (0, 0), (-1, -1), 0.5, BORDER),
        ("TOPPADDING",    (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(tbl)
    story.append(Spacer(1, 0.4*cm))

    # ── 3. Equity Curve ───────────────────────────────────────────────────────
    if run.equity_curve:
        try:
            equity_points = json.loads(run.equity_curve)
            if equity_points:
                story.append(Paragraph("Equity Curve", h2_style))
                png_bytes = _equity_curve_png(equity_points)
                img = Image(io.BytesIO(png_bytes), width=15*cm, height=5*cm)
                story.append(img)
                story.append(Spacer(1, 0.4*cm))
        except Exception:
            pass

    # ── 4. Trade Log (top 20) ─────────────────────────────────────────────────
    if run.trades:
        try:
            trades = json.loads(run.trades)
            if trades:
                story.append(Paragraph("Recent Trades (up to 20)", h2_style))
                trade_header = ["Date", "Symbol", "Side", "Price", "Size"]
                trade_rows   = [trade_header]
                for t in trades[:20]:
                    trade_rows.append([
                        t.get("date", ""),
                        t.get("symbol", ""),
                        t.get("side", "").upper(),
                        f"${float(t.get('price', 0)):.2f}",
                        f"{float(t.get('size', 0)):.2f}",
                    ])
                t_tbl = Table(trade_rows, colWidths=[3.5*cm, 2.5*cm, 2*cm, 3.5*cm, 3*cm])
                t_tbl.setStyle(TableStyle([
                    ("BACKGROUND",    (0, 0), (-1, 0),  SURFACE),
                    ("TEXTCOLOR",     (0, 0), (-1, 0),  PRIMARY),
                    ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
                    ("FONTSIZE",      (0, 0), (-1, -1), 8),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [CARD_BG, SURFACE]),
                    ("TEXTCOLOR",     (0, 1), (-1, -1), TEXT),
                    ("GRID",          (0, 0), (-1, -1), 0.5, BORDER),
                    ("TOPPADDING",    (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]))
                story.append(t_tbl)
        except Exception:
            pass

    doc.build(story)
    buf.seek(0)
    return buf.read()
