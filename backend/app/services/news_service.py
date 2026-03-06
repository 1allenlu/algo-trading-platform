"""
News Service — Phase 14.

Fetches recent news articles via yfinance and scores them with VADER
(Valence Aware Dictionary and sEntiment Reasoner), a lexicon-based model
designed for social-media / financial text.  No model download or GPU needed.

VADER compound score range: [-1.0, +1.0]
  ≥ +0.05  → positive (bullish)
  ≤ -0.05  → negative (bearish)
  in between → neutral

Public interface:
  get_news(symbol, max_articles)  → list[NewsArticle]
  get_aggregate_sentiment(symbol) → NewsAggregateSentiment
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

import yfinance as yf
from loguru import logger
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Module-level VADER analyzer (initialises once, thread-safe reads)
_analyzer = SentimentIntensityAnalyzer()

# Simple in-memory cache: symbol → (timestamp, result) to avoid hammering yfinance
_news_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL = 300   # 5 minutes


@dataclass
class NewsArticle:
    title:       str
    publisher:   str
    link:        str
    published:   str   # ISO 8601
    compound:    float  # VADER compound in [-1, +1]
    label:       str   # "bullish" | "bearish" | "neutral"
    summary:     str   # First 200 chars of title + description


@dataclass
class NewsAggregateSentiment:
    symbol:          str
    article_count:   int
    avg_compound:    float
    bullish_count:   int
    bearish_count:   int
    neutral_count:   int
    label:           str   # overall label based on avg compound
    articles:        list[NewsArticle] = field(default_factory=list)


def _label(score: float) -> str:
    if score >= 0.05:
        return "bullish"
    if score <= -0.05:
        return "bearish"
    return "neutral"


def _score_article(article: dict[str, Any]) -> NewsArticle:
    """Score a single yfinance news article with VADER."""
    title      = article.get("title", "")
    publisher  = article.get("publisher", "")
    link       = article.get("link", "")
    pub_ts     = article.get("providerPublishTime", 0)
    summary    = (title + " " + article.get("summary", ""))[:200]

    # VADER scores the combined title + summary for best signal
    scores   = _analyzer.polarity_scores(summary)
    compound = scores["compound"]

    # Convert Unix timestamp → ISO 8601
    try:
        from datetime import datetime, timezone
        published = datetime.fromtimestamp(pub_ts, tz=timezone.utc).isoformat()
    except Exception:
        published = ""

    return NewsArticle(
        title     = title,
        publisher = publisher,
        link      = link,
        published = published,
        compound  = round(compound, 4),
        label     = _label(compound),
        summary   = summary,
    )


def _fetch_raw_news(symbol: str) -> list[dict[str, Any]]:
    """Fetch raw news from yfinance with caching."""
    now = time.time()
    cached = _news_cache.get(symbol.upper())
    if cached and (now - cached[0]) < _CACHE_TTL:
        return cached[1]

    try:
        ticker = yf.Ticker(symbol.upper())
        raw    = ticker.news or []
    except Exception as exc:
        logger.warning(f"[news] yfinance error for {symbol}: {exc}")
        raw = []

    _news_cache[symbol.upper()] = (now, raw)
    return raw


def get_news(symbol: str, max_articles: int = 20) -> list[NewsArticle]:
    """
    Return a list of scored news articles for a symbol.
    Articles are sorted newest-first.
    """
    raw      = _fetch_raw_news(symbol)[:max_articles]
    articles = [_score_article(a) for a in raw]
    # Sort newest first (published ISO strings sort lexicographically)
    articles.sort(key=lambda a: a.published, reverse=True)
    return articles


def get_aggregate_sentiment(symbol: str, max_articles: int = 20) -> NewsAggregateSentiment:
    """
    Compute aggregate news sentiment for a symbol.
    Returns article-level scores plus a rolled-up label.
    """
    articles = get_news(symbol, max_articles)

    if not articles:
        return NewsAggregateSentiment(
            symbol        = symbol.upper(),
            article_count = 0,
            avg_compound  = 0.0,
            bullish_count = 0,
            bearish_count = 0,
            neutral_count = 0,
            label         = "neutral",
            articles      = [],
        )

    avg_compound  = sum(a.compound for a in articles) / len(articles)
    bullish_count = sum(1 for a in articles if a.label == "bullish")
    bearish_count = sum(1 for a in articles if a.label == "bearish")
    neutral_count = sum(1 for a in articles if a.label == "neutral")

    return NewsAggregateSentiment(
        symbol        = symbol.upper(),
        article_count = len(articles),
        avg_compound  = round(avg_compound, 4),
        bullish_count = bullish_count,
        bearish_count = bearish_count,
        neutral_count = neutral_count,
        label         = _label(avg_compound),
        articles      = articles,
    )
