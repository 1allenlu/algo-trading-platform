/**
 * InfoTooltip — small info icon that shows a plain-English explanation on hover.
 * Use next to any metric label to help users understand what it means.
 */

import { Tooltip, Box } from '@mui/material'
import { InfoOutlined as InfoIcon } from '@mui/icons-material'

interface InfoTooltipProps {
  text: string
  size?: number
}

export default function InfoTooltip({ text, size = 13 }: InfoTooltipProps) {
  return (
    <Tooltip
      title={text}
      placement="top"
      arrow
      componentsProps={{
        tooltip: {
          sx: {
            bgcolor: '#1E2330',
            border: '1px solid',
            borderColor: 'divider',
            color: 'text.secondary',
            fontSize: '0.75rem',
            maxWidth: 260,
            p: 1.25,
          },
        },
        arrow: { sx: { color: '#1E2330' } },
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          ml: 0.5,
          color: 'text.disabled',
          cursor: 'help',
          verticalAlign: 'middle',
          '&:hover': { color: 'text.secondary' },
        }}
      >
        <InfoIcon sx={{ fontSize: size }} />
      </Box>
    </Tooltip>
  )
}
