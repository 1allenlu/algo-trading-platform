/**
 * SymbolSearch — global symbol search bar in the TopBar.
 * Type a ticker to get quick links: Signals, ML, News, Options.
 */

import {
  Box,
  ClickAwayListener,
  Divider,
  InputAdornment,
  Paper,
  Popper,
  TextField,
  Typography,
} from '@mui/material'
import {
  Search as SearchIcon,
  SignalCellularAlt as SignalsIcon,
  Psychology as MLIcon,
  Newspaper as NewsIcon,
  Layers as OptionsIcon,
  ShowChart as ChartIcon,
} from '@mui/icons-material'
import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'

const ALL_SYMBOLS = [
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META',
  'TSLA', 'JPM', 'XOM', 'GLD', 'AAPL', 'AMD', 'NFLX', 'DIS',
  'BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD',
]

const QUICK_LINKS = [
  { label: 'Signals', icon: <SignalsIcon sx={{ fontSize: 14 }} />, path: (s: string) => `/signals?symbol=${s}`, color: '#8B5CF6' },
  { label: 'AI',      icon: <MLIcon     sx={{ fontSize: 14 }} />, path: (s: string) => `/ml?symbol=${s}`,      color: '#EC4899' },
  { label: 'News',    icon: <NewsIcon   sx={{ fontSize: 14 }} />, path: (s: string) => `/news?symbol=${s}`,    color: '#F97316' },
  { label: 'Options', icon: <OptionsIcon sx={{ fontSize: 14 }} />, path: (s: string) => `/options?symbol=${s}`, color: '#10B981' },
  { label: 'Chart',   icon: <ChartIcon  sx={{ fontSize: 14 }} />, path: (s: string) => `/dashboard`,           color: '#4A9EFF' },
]

export default function SymbolSearch() {
  const [query,  setQuery]  = useState('')
  const [open,   setOpen]   = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)
  const navigate  = useNavigate()

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toUpperCase()
    return [...new Set(ALL_SYMBOLS)].filter((s) => s.includes(q)).slice(0, 6)
  }, [query])

  const handleSelect = (symbol: string, path: string) => {
    navigate(path)
    setQuery('')
    setOpen(false)
  }

  const handleFocus = () => { if (query.trim()) setOpen(true) }
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value)
    setOpen(e.target.value.trim().length > 0)
  }

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box ref={anchorRef} sx={{ position: 'relative' }}>
        <TextField
          size="small"
          placeholder="Search symbol…"
          value={query}
          onChange={handleChange}
          onFocus={handleFocus}
          autoComplete="off"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
              </InputAdornment>
            ),
          }}
          sx={{
            width: 160,
            '& .MuiOutlinedInput-root': {
              fontSize: '0.8rem',
              height: 32,
              bgcolor: 'rgba(255,255,255,0.04)',
              '& fieldset': { borderColor: 'divider' },
              '&:hover fieldset': { borderColor: 'text.disabled' },
              '&.Mui-focused fieldset': { borderColor: 'primary.main' },
            },
            '& input': { py: 0, fontFamily: 'IBM Plex Mono, monospace' },
          }}
        />

        <Popper
          open={open && results.length > 0}
          anchorEl={anchorRef.current}
          placement="bottom-start"
          style={{ zIndex: 1400, width: 280 }}
        >
          <Paper
            elevation={8}
            sx={{
              mt: 0.5,
              border: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
              overflow: 'hidden',
            }}
          >
            {results.map((symbol, i) => (
              <Box key={symbol}>
                {i > 0 && <Divider />}
                <Box sx={{ px: 1.5, py: 1 }}>
                  <Typography
                    variant="caption"
                    fontWeight={700}
                    fontFamily="IBM Plex Mono, monospace"
                    color="text.primary"
                    display="block"
                    mb={0.75}
                  >
                    {symbol}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {QUICK_LINKS.map(({ label, icon, path, color }) => (
                      <Box
                        key={label}
                        onClick={() => handleSelect(symbol, path(symbol))}
                        sx={{
                          display:     'flex',
                          alignItems:  'center',
                          gap:         0.4,
                          px:          1,
                          py:          0.3,
                          borderRadius: 1,
                          border:      '1px solid',
                          borderColor: `${color}44`,
                          color,
                          cursor:      'pointer',
                          fontSize:    '0.68rem',
                          fontWeight:  600,
                          '&:hover':   { bgcolor: `${color}14` },
                        }}
                      >
                        {icon}
                        {label}
                      </Box>
                    ))}
                  </Box>
                </Box>
              </Box>
            ))}
          </Paper>
        </Popper>
      </Box>
    </ClickAwayListener>
  )
}
