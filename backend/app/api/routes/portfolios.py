"""Multi-Portfolio routes — Phase 67."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import AsyncSessionLocal
from app.services import portfolio_service

router = APIRouter()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


class CreatePortfolioRequest(BaseModel):
    name:          str
    description:   str | None = None
    starting_cash: float = 100_000.0


@router.get("/")
async def list_portfolios(db: AsyncSession = Depends(get_db)) -> list[dict]:
    """List all named paper portfolios (default + user-created)."""
    return await portfolio_service.list_portfolios(db)


@router.post("/", status_code=201)
async def create_portfolio(body: CreatePortfolioRequest, db: AsyncSession = Depends(get_db)) -> dict:
    """Create a new named paper portfolio."""
    if body.starting_cash < 100:
        raise HTTPException(400, "starting_cash must be ≥ $100")
    return await portfolio_service.create_portfolio(body.name, body.description, body.starting_cash, db)


@router.get("/{portfolio_id}")
async def get_portfolio(portfolio_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    data = await portfolio_service.get_portfolio(portfolio_id, db)
    if not data:
        raise HTTPException(404, "Portfolio not found")
    return data


@router.delete("/{portfolio_id}")
async def delete_portfolio(portfolio_id: int, db: AsyncSession = Depends(get_db)) -> dict:
    ok = await portfolio_service.delete_portfolio(portfolio_id, db)
    if not ok:
        raise HTTPException(400, "Cannot delete default portfolio or portfolio not found")
    return {"deleted": portfolio_id}
