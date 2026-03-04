import { Box, Card, CardContent, Typography } from '@mui/material'

export default function Settings() {
  return (
    <Box>
      <Typography variant="h4" gutterBottom>Settings</Typography>
      <Card sx={{ opacity: 0.75 }}>
        <CardContent>
          <Typography color="text.secondary">
            Phase 6: API keys (Alpaca paper trading), data source config,
            notification preferences, user authentication.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
