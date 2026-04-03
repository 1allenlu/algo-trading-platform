/**
 * EmptyState — friendly zero-data screen with an icon, title, description,
 * and an optional action button. Drop this in place of raw error alerts.
 */

import { Box, Button, Typography } from '@mui/material'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon:        ReactNode
  title:       string
  description: string
  actionLabel?: string
  onAction?:   () => void
  hint?:       string   // secondary smaller hint, e.g. a terminal command
}

export default function EmptyState({
  icon, title, description, actionLabel, onAction, hint,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        justifyContent: 'center',
        textAlign:      'center',
        py:             8,
        px:             3,
        border:         '1px dashed',
        borderColor:    'divider',
        borderRadius:   2,
      }}
    >
      <Box sx={{ color: 'text.disabled', mb: 2, opacity: 0.5 }}>
        {icon}
      </Box>

      <Typography variant="h6" fontWeight={700} mb={1}>
        {title}
      </Typography>

      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 380, lineHeight: 1.6 }}>
        {description}
      </Typography>

      {hint && (
        <Box
          sx={{
            mt:          1.5,
            px:          2,
            py:          0.75,
            bgcolor:     'rgba(255,255,255,0.04)',
            borderRadius: 1,
            border:      '1px solid',
            borderColor: 'divider',
          }}
        >
          <Typography
            variant="caption"
            fontFamily="IBM Plex Mono, monospace"
            color="text.disabled"
          >
            {hint}
          </Typography>
        </Box>
      )}

      {actionLabel && onAction && (
        <Button
          variant="contained"
          onClick={onAction}
          sx={{ mt: 3, fontWeight: 700, textTransform: 'none', px: 3 }}
        >
          {actionLabel}
        </Button>
      )}
    </Box>
  )
}
