/**
 * CandlestickChart — TradingView lightweight-charts candlestick + volume.
 *
 * Phase 26: replaces the Recharts area chart on Dashboard for a genuine
 * OHLCV candlestick view.  Candles are green/red; volume bars are rendered
 * in a lower 20% pane.  ResizeObserver keeps the chart width responsive.
 */

import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
} from 'lightweight-charts'
import type { OHLCVBar } from '@/services/api'

interface CandlestickChartProps {
  bars:    OHLCVBar[]
  height?: number
}

export default function CandlestickChart({ bars, height = 240 }: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    const el = containerRef.current

    // ── Create chart ──────────────────────────────────────────────────────────
    const chart = createChart(el, {
      width:  el.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor:  '#9CA3AF',
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize:   11,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: '#1E2330' },
      },
      crosshair: {
        // CrosshairMode.Normal = 1
        mode: 1,
        vertLine: { color: '#374151', style: 2 },
        horzLine: { color: '#374151', style: 2 },
      },
      rightPriceScale: {
        borderVisible:  false,
        textColor:      '#9CA3AF',
        scaleMargins:   { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderVisible:    false,
        timeVisible:      true,
        secondsVisible:   false,
        tickMarkFormatter: (time: unknown) => {
          // time is a "YYYY-MM-DD" string when using date strings
          const dateStr = typeof time === 'string' ? time : ''
          const parts = dateStr.split('-')
          if (parts.length === 3) {
            const d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]))
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          }
          return String(time)
        },
      },
      handleScroll:   true,
      handleScale:    true,
    })

    // ── Candlestick series ─────────────────────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:        '#00C896',
      downColor:      '#FF6B6B',
      borderUpColor:  '#00C896',
      borderDownColor:'#FF6B6B',
      wickUpColor:    '#00C896',
      wickDownColor:  '#FF6B6B',
    })

    // ── Volume histogram (bottom 20% pane) ────────────────────────────────────
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    // ── Feed data — deduplicate + sort asc (lightweight-charts requirement) ─────
    // The DB can have duplicate dates (e.g. split-adjusted rows); keep the last.
    const seen = new Map<string, typeof bars[number]>()
    for (const b of bars) {
      seen.set(b.timestamp.split('T')[0], b)
    }
    const unique = Array.from(seen.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))

    const candleData = unique.map(([date, b]) => ({
      time:  date as `${number}-${number}-${number}`,
      open:  b.open,
      high:  b.high,
      low:   b.low,
      close: b.close,
    }))

    const volumeData = unique.map(([date, b]) => ({
      time:  date as `${number}-${number}-${number}`,
      value: b.volume,
      color: b.close >= b.open ? 'rgba(0,200,150,0.35)' : 'rgba(255,107,107,0.35)',
    }))

    candleSeries.setData(candleData)
    volumeSeries.setData(volumeData)
    chart.timeScale().fitContent()

    // ── Responsive resize ─────────────────────────────────────────────────────
    const obs = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth })
      }
    })
    obs.observe(el)

    return () => {
      obs.disconnect()
      chart.remove()
    }
  }, [bars, height])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
