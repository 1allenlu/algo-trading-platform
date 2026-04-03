/**
 * GettingStarted — dismissible onboarding checklist shown on the Dashboard.
 * Walks new users through the 4 steps needed to get value from the platform.
 * Dismissed state is persisted in localStorage.
 */

import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Collapse,
  IconButton,
  Typography,
} from '@mui/material'
import {
  Close as CloseIcon,
  CheckCircle as DoneIcon,
  RadioButtonUnchecked as TodoIcon,
  Storage as IngestIcon,
  Psychology as MLIcon,
  Assessment as BacktestIcon,
  CandlestickChart as TradeIcon,
} from '@mui/icons-material'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const STORAGE_KEY = 'qs_onboarding_dismissed'

const STEPS = [
  {
    icon:        <IngestIcon sx={{ fontSize: 20 }} />,
    title:       'Load market data',
    description: 'Run make ingest in your terminal to download 5 years of price history.',
    action:      null,
    actionLabel: null,
    color:       '#4A9EFF',
  },
  {
    icon:        <MLIcon sx={{ fontSize: 20 }} />,
    title:       'Train an AI model',
    description: 'Head to the AI Models page and click "Train Model" to build your first price predictor.',
    action:      '/ml',
    actionLabel: 'Go to AI Models',
    color:       '#8B5CF6',
  },
  {
    icon:        <BacktestIcon sx={{ fontSize: 20 }} />,
    title:       'Run a backtest',
    description: 'Test a strategy against historical data to see how it would have performed.',
    action:      '/backtest',
    actionLabel: 'Go to Backtest',
    color:       '#10B981',
  },
  {
    icon:        <TradeIcon sx={{ fontSize: 20 }} />,
    title:       'Place your first paper trade',
    description: 'Practice trading with no real money — build confidence before going live.',
    action:      '/trading',
    actionLabel: 'Go to Trading',
    color:       '#F59E0B',
  },
]

export default function GettingStarted({ completedSteps = [] }: { completedSteps?: number[] }) {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  )
  const navigate = useNavigate()

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, 'true')
    setDismissed(true)
  }

  return (
    <Collapse in={!dismissed} unmountOnExit>
      <Card
        sx={{
          mb: 3,
          border: '1px solid',
          borderColor: 'rgba(74,158,255,0.3)',
          bgcolor: 'rgba(74,158,255,0.04)',
        }}
      >
        <CardContent sx={{ pb: '16px !important' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Typography variant="subtitle1" fontWeight={700}>
                  Getting Started
                </Typography>
                <Chip label="New" size="small" color="primary" sx={{ height: 18, fontSize: '0.6rem' }} />
              </Box>
              <Typography variant="body2" color="text.secondary">
                Follow these 4 steps to get the most out of QuantStream
              </Typography>
            </Box>
            <IconButton size="small" onClick={handleDismiss} sx={{ color: 'text.disabled' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Steps */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
              gap: 1.5,
            }}
          >
            {STEPS.map((step, i) => {
              const done = completedSteps.includes(i)
              return (
                <Box
                  key={step.title}
                  sx={{
                    p: 1.5,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: done ? `${step.color}44` : 'divider',
                    bgcolor: done ? `${step.color}0A` : 'transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ color: done ? step.color : 'text.disabled' }}>{step.icon}</Box>
                    {done
                      ? <DoneIcon sx={{ fontSize: 16, color: step.color }} />
                      : <TodoIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                    }
                  </Box>
                  <Box>
                    <Typography variant="caption" fontWeight={700} display="block" sx={{ color: done ? step.color : 'text.primary' }}>
                      {i + 1}. {step.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.4, display: 'block', mt: 0.25 }}>
                      {step.description}
                    </Typography>
                  </Box>
                  {step.action && (
                    <Button
                      size="small"
                      variant={done ? 'text' : 'outlined'}
                      onClick={() => navigate(step.action!)}
                      sx={{
                        mt: 'auto',
                        fontSize: '0.7rem',
                        py: 0.4,
                        textTransform: 'none',
                        borderColor: step.color,
                        color: step.color,
                        '&:hover': { borderColor: step.color, bgcolor: `${step.color}12` },
                      }}
                    >
                      {step.actionLabel}
                    </Button>
                  )}
                </Box>
              )
            })}
          </Box>

          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', mt: 1.5, textAlign: 'right', cursor: 'pointer', '&:hover': { color: 'text.secondary' } }}
            onClick={handleDismiss}
          >
            Dismiss this guide
          </Typography>
        </CardContent>
      </Card>
    </Collapse>
  )
}
