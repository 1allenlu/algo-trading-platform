import { Box, Card, CardContent, Typography, List, ListItem, ListItemText } from '@mui/material'

export default function Backtest() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Backtesting</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Event-driven backtesting engine — coming in Phase 3.
      </Typography>

      <Card sx={{ opacity: 0.75 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Planned features</Typography>
          <List dense disablePadding>
            {[
              'Event-driven architecture (market data → signals → orders → fills)',
              'Transaction cost modeling (slippage + commission)',
              'Performance metrics: Sharpe, Sortino, max drawdown, Calmar',
              'Walk-forward validation to prevent overfitting',
              'Benchmark comparison (SPY buy-and-hold)',
              'Equity curve + drawdown chart + trade log UI',
            ].map((f) => (
              <ListItem key={f} disablePadding sx={{ py: 0.25 }}>
                <ListItemText
                  primary={f}
                  primaryTypographyProps={{ variant: 'body2', color: 'text.secondary' }}
                />
              </ListItem>
            ))}
          </List>
        </CardContent>
      </Card>
    </Box>
  )
}
