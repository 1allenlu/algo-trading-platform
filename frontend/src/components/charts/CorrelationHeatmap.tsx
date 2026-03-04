/**
 * CorrelationHeatmap — pairwise correlation matrix visualization.
 *
 * Displays an NxN grid where each cell is colored by correlation value:
 *   +1.0 → cyan  (strong positive, assets move together)
 *    0.0 → dark neutral
 *   -1.0 → orange (negative, assets move opposite — good for diversification)
 *
 * Low correlation between assets = better diversification = lower portfolio vol.
 */

import { Box, Tooltip, Typography } from '@mui/material'

interface CorrelationHeatmapProps {
  symbols:     string[]
  correlation: number[][]   // NxN matrix, correlation[i][j] for symbols[i] vs symbols[j]
}

// Map correlation [-1, 1] to a CSS color
function corrToColor(value: number): string {
  if (value >= 0) {
    // 0 → dark background, +1 → cyan
    const intensity = Math.round(value * 180)
    return `rgba(0, ${100 + intensity}, ${180 + Math.round(intensity * 0.4)}, ${0.2 + value * 0.75})`
  } else {
    // 0 → dark background, -1 → orange
    const intensity = Math.abs(value)
    return `rgba(247, ${127 - Math.round(intensity * 100)}, 0, ${0.2 + intensity * 0.75})`
  }
}

function corrToText(value: number): string {
  const color = value > 0.3 ? '#e2e8f0' : value < -0.3 ? '#fed7aa' : '#94a3b8'
  return color
}

export default function CorrelationHeatmap({ symbols, correlation }: CorrelationHeatmapProps) {
  const n        = symbols.length
  const cellSize = Math.min(72, Math.floor(480 / (n + 1)))

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        sx={{
          display:    'grid',
          gridTemplateColumns: `${cellSize}px repeat(${n}, ${cellSize}px)`,
          gap:        1,
          width:      'fit-content',
        }}
      >
        {/* Top-left empty cell */}
        <Box sx={{ width: cellSize, height: cellSize }} />

        {/* Column headers */}
        {symbols.map((sym) => (
          <Box
            key={sym}
            sx={{
              width:      cellSize,
              height:     cellSize,
              display:    'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography
              variant="caption"
              fontWeight={700}
              fontFamily="Roboto Mono, monospace"
              sx={{ fontSize: n > 5 ? '0.62rem' : '0.72rem', color: 'primary.main' }}
            >
              {sym}
            </Typography>
          </Box>
        ))}

        {/* Rows */}
        {symbols.map((rowSym, i) => (
          <>
            {/* Row label */}
            <Box
              key={`label-${rowSym}`}
              sx={{
                width:      cellSize,
                height:     cellSize,
                display:    'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                pr: 0.5,
              }}
            >
              <Typography
                variant="caption"
                fontWeight={700}
                fontFamily="Roboto Mono, monospace"
                sx={{ fontSize: n > 5 ? '0.62rem' : '0.72rem', color: 'primary.main' }}
              >
                {rowSym}
              </Typography>
            </Box>

            {/* Correlation cells */}
            {symbols.map((colSym, j) => {
              const val = correlation[i]?.[j] ?? 0
              const bg  = corrToColor(val)
              const textColor = corrToText(val)
              const isDiagonal = i === j

              return (
                <Tooltip
                  key={`${rowSym}-${colSym}`}
                  title={`${rowSym} vs ${colSym}: ρ = ${val.toFixed(3)}`}
                  placement="top"
                >
                  <Box
                    sx={{
                      width:      cellSize,
                      height:     cellSize,
                      bgcolor:    isDiagonal ? 'rgba(0,180,216,0.3)' : bg,
                      borderRadius: 1,
                      display:    'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border:     isDiagonal ? '1px solid rgba(0,180,216,0.5)' : '1px solid rgba(255,255,255,0.04)',
                      cursor:     'default',
                      transition: 'opacity 0.15s',
                      '&:hover':  { opacity: 0.8 },
                    }}
                  >
                    <Typography
                      variant="caption"
                      fontFamily="Roboto Mono, monospace"
                      sx={{ fontSize: n > 5 ? '0.6rem' : '0.7rem', color: isDiagonal ? 'primary.main' : textColor, fontWeight: 600 }}
                    >
                      {val.toFixed(2)}
                    </Typography>
                  </Box>
                </Tooltip>
              )
            })}
          </>
        ))}
      </Box>

      {/* Legend */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1.5 }}>
        <Box
          sx={{
            width: 100, height: 10, borderRadius: 1,
            background: 'linear-gradient(to right, rgba(247,80,0,0.8), rgba(30,41,59,0.5), rgba(0,180,216,0.9))',
          }}
        />
        <Typography variant="caption" color="text.disabled">
          −1 (diversifying) → 0 → +1 (correlated)
        </Typography>
      </Box>
    </Box>
  )
}
