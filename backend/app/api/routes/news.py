"""
News routes — Phase 14.

VADER-scored financial news via yfinance.

Endpoints:
  GET /api/news/{symbol}            → aggregate sentiment + article list
  GET /api/news/{symbol}/articles   → just the article list (max_articles param)
"""

from fastapi import APIRouter, Query
from app.services.news_service import get_aggregate_sentiment, get_news

router = APIRouter()


@router.get("/{symbol}")
async def get_news_sentiment(
    symbol:       str,
    max_articles: int = Query(default=20, ge=1, le=50),
) -> dict:
    """
    Return aggregate VADER sentiment and scored articles for a symbol.
    Cached for 5 minutes per symbol to avoid rate-limiting yfinance.
    """
    agg = get_aggregate_sentiment(symbol.upper(), max_articles)
    return {
        "symbol":        agg.symbol,
        "article_count": agg.article_count,
        "avg_compound":  agg.avg_compound,
        "bullish_count": agg.bullish_count,
        "bearish_count": agg.bearish_count,
        "neutral_count": agg.neutral_count,
        "label":         agg.label,
        "articles": [
            {
                "title":     a.title,
                "publisher": a.publisher,
                "link":      a.link,
                "published": a.published,
                "compound":  a.compound,
                "label":     a.label,
                "summary":   a.summary,
            }
            for a in agg.articles
        ],
    }


@router.get("/{symbol}/articles")
async def list_articles(
    symbol:       str,
    max_articles: int = Query(default=10, ge=1, le=50),
) -> list[dict]:
    """Return just the article list without aggregate stats."""
    articles = get_news(symbol.upper(), max_articles)
    return [
        {
            "title":     a.title,
            "publisher": a.publisher,
            "link":      a.link,
            "published": a.published,
            "compound":  a.compound,
            "label":     a.label,
        }
        for a in articles
    ]
