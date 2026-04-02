/**
 * CandlestickChart — TradingView lightweight-charts candlestick + volume.
 *
 * Phase 26: original daily candlestick chart.
 * Phase 31: adds `timeframe` prop — when not '1D', uses Unix timestamps
 *           (seconds) instead of date strings, enabling intraday candles.
 * Phase 33: adds `earningsMarkers` prop — renders amber ▼ markers at
 *           past earnings dates (daily view only).
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
  bars:              OHLCVBar[]
  height?:           number
  /** '1D' = daily (default). '1h' | '15m' | '5m' | '1m' = intraday. */
  timeframe?:        string
  /** ISO date strings (YYYY-MM-DD) of past earnings — shown as markers on daily view. */
  earningsMarkers?:  string[]
}

export default function CandlestickChart({
  bars,
  height = 240,
  timeframe = '1D',
  earningsMarkers,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || bars.length === 0) return

    const el      = containerRef.current
    const isDaily = timeframe === '1D'

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
        mode: 1,  // CrosshairMode.Normal
        vertLine: { color: '#374151', style: 2 },
        horzLine: { color: '#374151', style: 2 },
      },
      rightPriceScale: {
        borderVisible: false,
        textColor:     '#9CA3AF',
        scaleMargins:  { top: 0.08, bottom: 0.25 },
      },
      timeScale: {
        borderVisible:  false,
        timeVisible:    true,
        secondsVisible: false,
        tickMarkFormatter: (time: unknown) => {
          if (isDaily) {
            // time is a "YYYY-MM-DD" string
            const dateStr = typeof time === 'string' ? time : ''
            const parts   = dateStr.split('-')
            if (parts.length === 3) {
              const d = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]))
              return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            }
            return String(time)
          } else {
            // time is a Unix timestamp in seconds
            const ts = typeof time === 'number' ? time * 1000 : 0
            const d  = new Date(ts)
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          }
        },
      },
      handleScroll: true,
      handleScale:  true,
    })

    // ── Series ────────────────────────────────────────────────────────────────
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor:         '#00C896',
      downColor:       '#FF6B6B',
      borderUpColor:   '#00C896',
      borderDownColor: '#FF6B6B',
      wickUpColor:     '#00C896',
      wickDownColor:   '#FF6B6B',
    })

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat:  { type: 'volume' },
      priceScaleId: 'vol',
    })
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })

    // ── Feed data ─────────────────────────────────────────────────────────────
    if (isDaily) {
      // Daily: use "YYYY-MM-DD" strings — deduplicate by date, sort asc
      const seen = new Map<string, typeof bars[number]>()
      for (const b of bars) {
        seen.set(b.timestamp.split('T')[0], b)
      }
      const unique = Array.from(seen.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))

      candleSeries.setData(unique.map(([date, b]) => ({
        time:  date as `${number}-${number}-${number}`,
        open:  b.open, high: b.high, low: b.low, close: b.close,
      })))

      volumeSeries.setData(unique.map(([date, b]) => ({
        time:  date as `${number}-${number}-${number}`,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(0,200,150,0.35)' : 'rgba(255,107,107,0.35)',
      })))

      // Earnings markers (daily view only)
      if (earningsMarkers?.length) {
        const dateSet = new Set(unique.map(([d]) => d))
        const markers = earningsMarkers
          .filter(d => dateSet.has(d))
          .map(d => ({
            time:     d as `${number}-${number}-${number}`,
            position: 'aboveBar' as const,
            color:    '#F59E0B',
            shape:    'arrowDown' as const,
            text:     'E',
            size:     1,
          }))
          .sort((a, b) => (a.time < b.time ? -1 : 1))

        if (markers.length) candleSeries.setMarkers(markers)
      }

    } else {
      // Intraday: use Unix timestamps (seconds) — deduplicate by full ISO, sort asc
      const seen = new Map<string, typeof bars[number]>()
      for (const b of bars) {
        seen.set(b.timestamp, b)
      }
      const unique = Array.from(seen.entries()).sort((a, b) => (a[0] < b[0] ? -1 : 1))

      const toUnix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000)

      candleSeries.setData(unique.map(([iso, b]) => ({
        time:  toUnix(iso) as unknown as `${number}-${number}-${number}`,
        open:  b.open, high: b.high, low: b.low, close: b.close,
      })))

      volumeSeries.setData(unique.map(([iso, b]) => ({
        time:  toUnix(iso) as unknown as `${number}-${number}-${number}`,
        value: b.volume,
        color: b.close >= b.open ? 'rgba(0,200,150,0.35)' : 'rgba(255,107,107,0.35)',
      })))
    }

    chart.timeScale().fitContent()

    // ── Responsive resize ─────────────────────────────────────────────────────
    const obs = new ResizeObserver(() => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth })
    })
    obs.observe(el)

    return () => { obs.disconnect(); chart.remove() }
  }, [bars, height, timeframe, earningsMarkers])

  return <div ref={containerRef} style={{ width: '100%', height }} />
}
