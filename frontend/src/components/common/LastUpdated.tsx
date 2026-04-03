/**
 * LastUpdated — shows a "Updated X min ago" badge that ticks every minute.
 * Pass the timestamp of the last successful data fetch.
 */

import { Box, Typography } from '@mui/material'
import { AccessTime as ClockIcon } from '@mui/icons-material'
import { useEffect, useState } from 'react'

function timeAgo(date: Date): string {
  const secs = Math.floor((Date.now() - date.getTime()) / 1000)
  if (secs < 10)  return 'just now'
  if (secs < 60)  return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

interface LastUpdatedProps {
  timestamp: Date | null
  loading?:  boolean
}

export default function LastUpdated({ timestamp, loading }: LastUpdatedProps) {
  const [label, setLabel] = useState<string>('')

  useEffect(() => {
    if (!timestamp) return
    setLabel(timeAgo(timestamp))
    const id = setInterval(() => setLabel(timeAgo(timestamp!)), 30_000)
    return () => clearInterval(id)
  }, [timestamp])

  if (loading) return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <ClockIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
      <Typography variant="caption" color="text.disabled">Fetching…</Typography>
    </Box>
  )

  if (!timestamp) return null

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <ClockIcon sx={{ fontSize: 12, color: 'text.disabled' }} />
      <Typography variant="caption" color="text.disabled">
        Updated {label}
      </Typography>
    </Box>
  )
}
