"""
Strategies API routes — Phase 3.

GET /api/strategies  — list available strategies with descriptions and default params
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter
from loguru import logger

from app.models.schemas import StrategiesResponse, StrategyInfo

router = APIRouter()


@router.get("", response_model=StrategiesResponse)
async def list_strategies() -> StrategiesResponse:
    """
    Return metadata for all available trading strategies.

    Imports from the quant_engine package (mounted at /quant_engine).
    Falls back gracefully if the package isn't available.
    """
    try:
        # quant_engine is available via PYTHONPATH=/
        from quant_engine.strategies import REGISTRY, STRATEGY_INFO, get_strategy

        items = []
        for name, info in STRATEGY_INFO.items():
            cls           = REGISTRY[name]
            default_params = cls().get_default_params()
            items.append(
                StrategyInfo(
                    name            = name,
                    description     = info["description"],
                    method          = info["method"],
                    default_symbols = info["default_symbols"],
                    min_symbols     = info["min_symbols"],
                    max_symbols     = info["max_symbols"],
                    tags            = info["tags"],
                    default_params  = default_params,
                )
            )
        return StrategiesResponse(strategies=items)

    except ImportError as exc:
        logger.warning(f"quant_engine not available: {exc}")
        return StrategiesResponse(strategies=[])
