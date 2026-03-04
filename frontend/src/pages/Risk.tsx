import { Box, Card, CardContent, Typography } from '@mui/material'

export default function Risk() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Risk Management</Typography>
      <Card sx={{ opacity: 0.75 }}>
        <CardContent>
          <Typography color="text.secondary">
            Phase 4: VaR/CVaR, portfolio volatility, factor exposure,
            Markowitz optimization, Kelly criterion position sizing.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
