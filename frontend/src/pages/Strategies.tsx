import { Box, Card, CardContent, Typography, Stack, Chip } from '@mui/material'
import { TrendingUp, Psychology, CompareArrows } from '@mui/icons-material'

const COMING_SOON = [
  { icon: <CompareArrows />, name: 'Pairs Trading',    phase: 'Phase 3', desc: 'Cointegration-based (Engle-Granger test). Long/short correlated pairs.' },
  { icon: <TrendingUp />,    name: 'Momentum',         phase: 'Phase 3', desc: 'Cross-sectional momentum with universe ranking and monthly rebalancing.' },
  { icon: <TrendingUp />,    name: 'Mean Reversion',   phase: 'Phase 3', desc: 'Bollinger Band breakouts with volatility-adjusted position sizing.' },
  { icon: <Psychology />,    name: 'ML-Enhanced',      phase: 'Phase 3', desc: 'LSTM + XGBoost signals combined with quant strategies via PyPortfolioOpt.' },
]

export default function Strategies() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Strategies</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Algorithmic strategies combining quant signals with ML predictions.
      </Typography>

      <Stack spacing={2}>
        {COMING_SOON.map(({ icon, name, phase, desc }) => (
          <Card key={name} sx={{ opacity: 0.7 }}>
            <CardContent sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
              <Box sx={{ color: 'text.disabled', mt: 0.5 }}>{icon}</Box>
              <Box sx={{ flexGrow: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="h6" fontSize="1rem">{name}</Typography>
                  <Chip label={phase} size="small" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                </Box>
                <Typography variant="body2" color="text.secondary">{desc}</Typography>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
