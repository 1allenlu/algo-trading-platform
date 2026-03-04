"""
Market data service layer.

Keeps business logic out of route handlers.
Routes call services; services talk to the database.
This separation makes unit testing trivial (mock the service, not the DB).
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import MarketData


class MarketDataService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get_latest_price(self, symbol: str) -> float | None:
        """Return the most recent close price for a symbol, or None."""
        stmt = (
            select(MarketData.close)
            .where(MarketData.symbol == symbol.upper())
            .order_by(MarketData.timestamp.desc())
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def get_available_symbols(self) -> list[str]:
        """Return all symbols that have data in the database."""
        from sqlalchemy import distinct
        stmt = select(distinct(MarketData.symbol)).order_by(MarketData.symbol)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
