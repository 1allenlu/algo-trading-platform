/**
 * Tests for API response shape validation.
 *
 * These tests validate that the TypeScript interfaces match expected
 * backend response shapes — caught early without needing a running backend.
 */

import { describe, it, expect } from 'vitest'
import type {
  SignalRow,
  MultiTFRow,
  TFSignal,
  KellyRow,
  VarContributionItem,
  VarContributionResponse,
  PaperPosition,
  AccountInfo,
} from '@/services/api'

// ── Type guard helpers ────────────────────────────────────────────────────────

function isSignalRow(obj: unknown): obj is SignalRow {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.symbol === 'string' &&
    typeof o.composite === 'string' &&
    typeof o.confidence === 'number' &&
    typeof o.score === 'number' &&
    typeof o.ml_direction === 'string' &&
    typeof o.rsi_signal === 'string' &&
    typeof o.last_updated === 'string'
  )
}

function isTFSignal(obj: unknown): obj is TFSignal {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return typeof o.signal === 'string' && typeof o.score === 'number'
}

function isMultiTFRow(obj: unknown): obj is MultiTFRow {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.symbol === 'string' &&
    isTFSignal(o.daily) &&
    typeof o.aligned === 'boolean' &&
    typeof o.strength === 'string'
  )
}

function isKellyRow(obj: unknown): obj is KellyRow {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.symbol === 'string' &&
    typeof o.win_rate === 'number' &&
    typeof o.win_loss_ratio === 'number' &&
    typeof o.full_kelly === 'number' &&
    typeof o.half_kelly === 'number' &&
    typeof o.source === 'string'
  )
}

function isVarContribItem(obj: unknown): obj is VarContributionItem {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return (
    typeof o.symbol === 'string' &&
    typeof o.weight === 'number' &&
    typeof o.individual_var_95 === 'number' &&
    typeof o.component_var_pct === 'number' &&
    typeof o.is_diversifier === 'boolean'
  )
}

// ── Fixture data ──────────────────────────────────────────────────────────────

const mockSignalRow: SignalRow = {
  symbol:          'SPY',
  last_price:      450.25,
  composite:       'buy',
  confidence:      0.72,
  score:           0.72,
  ml_direction:    'up',
  ml_confidence:   0.78,
  rsi:             42.5,
  rsi_signal:      'neutral',
  sentiment_score: 0.15,
  sentiment_label: 'neutral',
  last_updated:    '2024-01-15T10:30:00Z',
}

const mockTFSignal: TFSignal = {
  signal: 'buy',
  score:  0.45,
  rsi:    43.0,
}

const mockMultiTFRow: MultiTFRow = {
  symbol:   'SPY',
  daily:    { signal: 'buy',  score: 0.72, rsi: 42.5 },
  weekly:   { signal: 'buy',  score: 0.35, rsi: 48.0 },
  monthly:  { signal: 'hold', score: 0.10, rsi: 55.0 },
  aligned:  true,
  strength: 'mostly_bullish',
}

const mockKellyRow: KellyRow = {
  symbol:         'SPY',
  win_rate:       0.68,
  win_loss_ratio: 1.45,
  full_kelly:     0.332,
  half_kelly:     0.166,
  source:         'model',
  n_trades:       0,
}

const mockVarContrib: VarContributionResponse = {
  symbols:          ['SPY', 'QQQ'],
  weights:          [0.5, 0.5],
  portfolio_var_95: 0.0187,
  contributions: [
    { symbol: 'SPY', weight: 0.5, individual_var_95: 0.021, component_var_pct: 52.3, is_diversifier: false },
    { symbol: 'QQQ', weight: 0.5, individual_var_95: 0.024, component_var_pct: 47.7, is_diversifier: false },
  ],
}

const mockPaperPosition: PaperPosition = {
  symbol:             'AAPL',
  qty:                10,
  avg_entry_price:    175.50,
  current_price:      180.00,
  market_value:       1800.00,
  unrealized_pnl:     45.00,
  unrealized_pnl_pct: 0.0256,
}

const mockAccount: AccountInfo = {
  equity:        105_000,
  cash:           85_000,
  buying_power:   85_000,
  day_pnl:           500,
  day_pnl_pct:      0.005,
  total_pnl:       5_000,
  total_pnl_pct:    0.05,
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SignalRow type guard', () => {
  it('validates a correct SignalRow object', () => {
    expect(isSignalRow(mockSignalRow)).toBe(true)
  })

  it('rejects missing composite field', () => {
    const bad = { ...mockSignalRow, composite: undefined }
    expect(isSignalRow(bad)).toBe(false)
  })

  it('rejects non-number confidence', () => {
    const bad = { ...mockSignalRow, confidence: '72%' }
    expect(isSignalRow(bad)).toBe(false)
  })

  it('allows null last_price', () => {
    const noPrice = { ...mockSignalRow, last_price: null }
    expect(isSignalRow(noPrice)).toBe(true)
  })
})

describe('MultiTFRow type guard', () => {
  it('validates a correct MultiTFRow', () => {
    expect(isMultiTFRow(mockMultiTFRow)).toBe(true)
  })

  it('rejects missing daily signal', () => {
    const bad = { ...mockMultiTFRow, daily: undefined }
    expect(isMultiTFRow(bad)).toBe(false)
  })

  it('allows null weekly/monthly (not enough data)', () => {
    const noWeekly = { ...mockMultiTFRow, weekly: null, monthly: null }
    expect(isMultiTFRow(noWeekly)).toBe(true)
  })

  it('rejects non-boolean aligned', () => {
    const bad = { ...mockMultiTFRow, aligned: 'yes' }
    expect(isMultiTFRow(bad)).toBe(false)
  })
})

describe('KellyRow type guard', () => {
  it('validates a correct KellyRow', () => {
    expect(isKellyRow(mockKellyRow)).toBe(true)
  })

  it('verifies half_kelly is half of full_kelly in fixture', () => {
    expect(mockKellyRow.half_kelly).toBeCloseTo(mockKellyRow.full_kelly / 2, 3)
  })

  it('rejects missing win_rate', () => {
    const bad = { ...mockKellyRow, win_rate: undefined }
    expect(isKellyRow(bad)).toBe(false)
  })
})

describe('VarContributionResponse', () => {
  it('validates all contribution items', () => {
    for (const item of mockVarContrib.contributions) {
      expect(isVarContribItem(item)).toBe(true)
    }
  })

  it('contributions sum to approximately 100%', () => {
    const total = mockVarContrib.contributions.reduce((s, c) => s + c.component_var_pct, 0)
    expect(total).toBeCloseTo(100.0, 0)
  })

  it('portfolio_var_95 is positive', () => {
    expect(mockVarContrib.portfolio_var_95).toBeGreaterThan(0)
  })

  it('weights sum to 1.0', () => {
    const total = mockVarContrib.weights.reduce((s, w) => s + w, 0)
    expect(total).toBeCloseTo(1.0, 6)
  })
})

describe('PaperPosition shape', () => {
  it('has all required fields', () => {
    const required: (keyof PaperPosition)[] = [
      'symbol', 'qty', 'avg_entry_price', 'current_price',
      'market_value', 'unrealized_pnl', 'unrealized_pnl_pct',
    ]
    for (const field of required) {
      expect(mockPaperPosition).toHaveProperty(field)
    }
  })

  it('market_value equals qty * current_price', () => {
    const { qty, current_price, market_value } = mockPaperPosition
    expect(market_value).toBeCloseTo(qty * current_price, 2)
  })
})

describe('AccountInfo shape', () => {
  it('has all required fields', () => {
    const required: (keyof AccountInfo)[] = [
      'equity', 'cash', 'buying_power', 'day_pnl', 'day_pnl_pct',
      'total_pnl', 'total_pnl_pct',
    ]
    for (const field of required) {
      expect(mockAccount).toHaveProperty(field)
    }
  })

  it('equity is greater than zero in fixture', () => {
    expect(mockAccount.equity).toBeGreaterThan(0)
  })
})

describe('Signal value constraints', () => {
  it('composite is one of buy/hold/sell', () => {
    const valid = ['buy', 'hold', 'sell']
    expect(valid).toContain(mockSignalRow.composite)
  })

  it('ml_direction is one of up/down/none', () => {
    const valid = ['up', 'down', 'none']
    expect(valid).toContain(mockSignalRow.ml_direction)
  })

  it('rsi_signal is one of oversold/neutral/overbought', () => {
    const valid = ['oversold', 'neutral', 'overbought']
    expect(valid).toContain(mockSignalRow.rsi_signal)
  })

  it('confidence is within 0-1 range', () => {
    expect(mockSignalRow.confidence).toBeGreaterThanOrEqual(0)
    expect(mockSignalRow.confidence).toBeLessThanOrEqual(1)
  })

  it('multi-tf strength is a known value', () => {
    const valid = ['strong_buy', 'strong_sell', 'mostly_bullish', 'mostly_bearish', 'mixed']
    expect(valid).toContain(mockMultiTFRow.strength)
  })
})

describe('TFSignal', () => {
  it('validates a correct TFSignal', () => {
    expect(isTFSignal(mockTFSignal)).toBe(true)
  })

  it('signal is one of buy/hold/sell', () => {
    const valid = ['buy', 'hold', 'sell']
    expect(valid).toContain(mockTFSignal.signal)
  })

  it('rejects missing score', () => {
    const bad = { signal: 'buy' }
    expect(isTFSignal(bad)).toBe(false)
  })
})
