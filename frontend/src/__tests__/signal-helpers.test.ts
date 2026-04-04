/**
 * Unit tests for pure helper functions used across the Signals page.
 * No React rendering — just logic.
 */

import { describe, it, expect } from 'vitest'

// ── Helpers duplicated from Signals.tsx for isolated testing ──────────────────

function signalColor(signal: string): string {
  if (signal === 'buy')  return '#00C896'
  if (signal === 'sell') return '#FF6B6B'
  return '#9CA3AF'
}

function signalBg(signal: string): string {
  if (signal === 'buy')  return 'rgba(0,200,150,0.12)'
  if (signal === 'sell') return 'rgba(255,107,107,0.12)'
  return 'rgba(156,163,175,0.08)'
}

function strengthLabel(strength: string): { text: string; color: string } {
  switch (strength) {
    case 'strong_buy':     return { text: 'Strong Buy',     color: '#00C896' }
    case 'strong_sell':    return { text: 'Strong Sell',    color: '#FF6B6B' }
    case 'mostly_bullish': return { text: 'Mostly Bullish', color: '#34D399' }
    case 'mostly_bearish': return { text: 'Mostly Bearish', color: '#F87171' }
    default:               return { text: 'Mixed',          color: '#9CA3AF' }
  }
}

// ── Kelly formula (mirrors backend computation) ───────────────────────────────

function computeKelly(winRate: number, winLossRatio: number) {
  const p = winRate
  const q = 1 - p
  const b = winLossRatio
  const fullKelly = Math.max(0, (p * b - q) / b)
  return { fullKelly, halfKelly: fullKelly / 2 }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('signalColor', () => {
  it('returns green for buy', () => {
    expect(signalColor('buy')).toBe('#00C896')
  })

  it('returns red for sell', () => {
    expect(signalColor('sell')).toBe('#FF6B6B')
  })

  it('returns grey for hold', () => {
    expect(signalColor('hold')).toBe('#9CA3AF')
  })

  it('returns grey for unknown signal', () => {
    expect(signalColor('unknown')).toBe('#9CA3AF')
    expect(signalColor('')).toBe('#9CA3AF')
  })
})

describe('signalBg', () => {
  it('returns green background for buy', () => {
    expect(signalBg('buy')).toContain('0,200,150')
  })

  it('returns red background for sell', () => {
    expect(signalBg('sell')).toContain('255,107,107')
  })

  it('returns neutral background for hold', () => {
    expect(signalBg('hold')).toContain('156,163,175')
  })
})

describe('strengthLabel', () => {
  it('labels strong buy correctly', () => {
    const result = strengthLabel('strong_buy')
    expect(result.text).toBe('Strong Buy')
    expect(result.color).toBe('#00C896')
  })

  it('labels strong sell correctly', () => {
    const result = strengthLabel('strong_sell')
    expect(result.text).toBe('Strong Sell')
    expect(result.color).toBe('#FF6B6B')
  })

  it('labels mostly bullish', () => {
    expect(strengthLabel('mostly_bullish').text).toBe('Mostly Bullish')
  })

  it('labels mostly bearish', () => {
    expect(strengthLabel('mostly_bearish').text).toBe('Mostly Bearish')
  })

  it('defaults to Mixed for unknown', () => {
    const result = strengthLabel('conflicted')
    expect(result.text).toBe('Mixed')
  })
})

describe('Kelly criterion formula', () => {
  it('coin flip with even odds gives zero Kelly', () => {
    const { fullKelly } = computeKelly(0.5, 1.0)
    expect(fullKelly).toBeCloseTo(0.0, 4)
  })

  it('60% win rate with 1:1 odds gives 20% Kelly', () => {
    const { fullKelly } = computeKelly(0.6, 1.0)
    expect(fullKelly).toBeCloseTo(0.2, 3)
  })

  it('70% win rate with 1.5 win:loss gives 50% Kelly', () => {
    // f* = (0.7 * 1.5 - 0.3) / 1.5 = (1.05 - 0.3) / 1.5 = 0.75 / 1.5 = 0.5
    const { fullKelly } = computeKelly(0.70, 1.5)
    expect(fullKelly).toBeCloseTo(0.5, 3)
  })

  it('negative edge clamps to zero', () => {
    const { fullKelly } = computeKelly(0.3, 1.0)
    expect(fullKelly).toBe(0.0)
  })

  it('half kelly is always half of full kelly', () => {
    for (const [p, b] of [[0.6, 1.5], [0.55, 2.0], [0.72, 1.2]]) {
      const { fullKelly, halfKelly } = computeKelly(p, b)
      expect(halfKelly).toBeCloseTo(fullKelly / 2, 6)
    }
  })

  it('higher win:loss ratio increases kelly for same win rate', () => {
    const k1 = computeKelly(0.6, 1.0).fullKelly
    const k2 = computeKelly(0.6, 2.0).fullKelly
    expect(k2).toBeGreaterThan(k1)
  })

  it('kelly fraction never exceeds 1', () => {
    // Even with very favourable params
    const { fullKelly } = computeKelly(0.99, 10.0)
    expect(fullKelly).toBeLessThanOrEqual(1.0)
  })
})

describe('Watchlist localStorage helpers', () => {
  const STORAGE_KEY = 'qs_watchlist'
  const DEFAULT_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA']

  function loadWatchlist(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return DEFAULT_SYMBOLS
  }

  function saveWatchlist(symbols: string[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols))
  }

  it('returns defaults when localStorage is empty', () => {
    const symbols = loadWatchlist()
    expect(symbols).toEqual(DEFAULT_SYMBOLS)
  })

  it('persists and loads custom symbols', () => {
    saveWatchlist(['TSLA', 'META'])
    const loaded = loadWatchlist()
    expect(loaded).toEqual(['TSLA', 'META'])
  })

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem(STORAGE_KEY, 'NOT_VALID_JSON{{')
    const symbols = loadWatchlist()
    expect(symbols).toEqual(DEFAULT_SYMBOLS)
  })

  it('persists empty array correctly', () => {
    saveWatchlist([])
    expect(loadWatchlist()).toEqual([])
  })
})

describe('Symbol validation (Watchlist)', () => {
  const VALID_SYMBOL_RE = /^[A-Z0-9.\-]{1,10}$/

  it('accepts standard tickers', () => {
    for (const sym of ['SPY', 'AAPL', 'BRK.B', 'QQQ', 'NVDA']) {
      expect(VALID_SYMBOL_RE.test(sym)).toBe(true)
    }
  })

  it('rejects empty string', () => {
    expect(VALID_SYMBOL_RE.test('')).toBe(false)
  })

  it('rejects symbols longer than 10 chars', () => {
    expect(VALID_SYMBOL_RE.test('TOOLONGSYMBOL')).toBe(false)
  })

  it('rejects symbols with spaces', () => {
    expect(VALID_SYMBOL_RE.test('SP Y')).toBe(false)
  })

  it('rejects lowercase symbols', () => {
    expect(VALID_SYMBOL_RE.test('spy')).toBe(false)
  })
})

describe('Rebalance target allocation persistence', () => {
  const TARGETS_KEY = 'qs_targets'

  function loadTargets(): Record<string, number> {
    try {
      const raw = localStorage.getItem(TARGETS_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return {}
  }

  function saveTargets(t: Record<string, number>) {
    localStorage.setItem(TARGETS_KEY, JSON.stringify(t))
  }

  it('returns empty object when no targets saved', () => {
    expect(loadTargets()).toEqual({})
  })

  it('saves and loads targets correctly', () => {
    const targets = { SPY: 40, QQQ: 30, AAPL: 30 }
    saveTargets(targets)
    expect(loadTargets()).toEqual(targets)
  })

  it('handles corrupted data gracefully', () => {
    localStorage.setItem(TARGETS_KEY, '{broken')
    expect(loadTargets()).toEqual({})
  })

  it('overwrites previous targets', () => {
    saveTargets({ SPY: 50 })
    saveTargets({ NVDA: 100 })
    expect(loadTargets()).toEqual({ NVDA: 100 })
  })
})
