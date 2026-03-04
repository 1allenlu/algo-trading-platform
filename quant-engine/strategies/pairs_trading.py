"""
Pairs trading strategy — Phase 3.

Method: Engle-Granger cointegration test (statsmodels)

Algorithm:
  1. Universe screening: find cointegrated pairs (p-value < 0.05)
  2. Spread = price_A - hedge_ratio * price_B
  3. Normalize: z-score = (spread - mean) / std  (rolling 60-day window)
  4. Entry: |z-score| > 2.0 — long cheap / short expensive
  5. Exit:  |z-score| < 0.5 — pairs converge

Risk controls:
  - Max pair exposure: 5% of portfolio
  - Stop-loss: z-score > 3.0 (divergence, not convergence)
  - Max holding period: 30 days
"""

# Placeholder — implementation begins in Phase 3
