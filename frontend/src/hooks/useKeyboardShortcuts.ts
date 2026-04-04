/**
 * useKeyboardShortcuts — global "G + letter" navigation shortcuts.
 *
 * Press G then (within 1 second) one of the mapped letters to navigate.
 * Press ? to toggle the shortcuts help modal.
 *
 * Shortcuts are suppressed when focus is inside an input, textarea, or select.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  IconButton,
  Box,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { createElement } from 'react'

// ---------------------------------------------------------------------------
// Route map — key letter → path
// ---------------------------------------------------------------------------
const ROUTE_MAP: Record<string, string> = {
  d: '/dashboard',
  b: '/backtest',
  t: '/trading',
  m: '/ml',
  s: '/signals',
  r: '/risk',
  a: '/analytics',
  c: '/compare',
  n: '/scanner',
}

/** Human-readable labels shown in the help modal */
const SHORTCUT_LABELS: { keys: string; description: string }[] = [
  { keys: 'G  D', description: 'Go to Dashboard' },
  { keys: 'G  B', description: 'Go to Backtest' },
  { keys: 'G  T', description: 'Go to Trading' },
  { keys: 'G  M', description: 'Go to ML Models' },
  { keys: 'G  S', description: 'Go to Signals' },
  { keys: 'G  R', description: 'Go to Risk' },
  { keys: 'G  A', description: 'Go to Analytics' },
  { keys: 'G  C', description: 'Go to Compare' },
  { keys: 'G  N', description: 'Go to Scanner' },
  { keys: '?',    description: 'Show / hide this help' },
]

// ---------------------------------------------------------------------------
// ShortcutHelpModal — exported so AppLayout can render it
// ---------------------------------------------------------------------------
interface ShortcutHelpModalProps {
  open:    boolean
  onClose: () => void
}

export function ShortcutHelpModal({ open, onClose }: ShortcutHelpModalProps) {
  return createElement(
    Dialog,
    { open, onClose, maxWidth: 'xs' as const, fullWidth: true },
    createElement(
      DialogTitle,
      { sx: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      createElement(Typography, { variant: 'h6' }, 'Keyboard Shortcuts'),
      createElement(
        IconButton,
        { onClick: onClose, size: 'small' as const },
        createElement(CloseIcon, { fontSize: 'small' as const }),
      ),
    ),
    createElement(
      DialogContent,
      { dividers: true },
      createElement(
        Table,
        { size: 'small' as const },
        createElement(
          TableBody,
          null,
          ...SHORTCUT_LABELS.map(({ keys, description }) =>
            createElement(
              TableRow,
              { key: keys },
              createElement(
                TableCell,
                { sx: { width: 80 } },
                createElement(
                  Box,
                  { component: 'span', sx: { fontFamily: 'monospace', fontWeight: 700 } },
                  keys,
                ),
              ),
              createElement(TableCell, null, description),
            ),
          ),
        ),
      ),
    ),
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useKeyboardShortcuts() {
  const navigate                    = useNavigate()
  const [showHelp, setShowHelp]     = useState(false)
  const lastKeyRef                  = useRef<string | null>(null)
  const lastKeyTimeRef              = useRef<number>(0)

  useEffect(() => {
    function isEditableTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false
      const tag = el.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable
    }

    function handleKeyDown(e: KeyboardEvent) {
      // Never fire shortcuts when typing in a form control
      if (isEditableTarget(e.target)) return

      const key = e.key.toLowerCase()
      const now  = Date.now()

      // ? — toggle help modal
      if (e.key === '?') {
        e.preventDefault()
        setShowHelp((prev) => !prev)
        lastKeyRef.current     = null
        lastKeyTimeRef.current = 0
        return
      }

      // G — first key of the chord; record it and wait for the second key
      if (key === 'g') {
        lastKeyRef.current     = 'g'
        lastKeyTimeRef.current = now
        return
      }

      // Second key — only act if the previous key was 'g' and within 1 second
      if (
        lastKeyRef.current === 'g' &&
        now - lastKeyTimeRef.current <= 1000 &&
        ROUTE_MAP[key]
      ) {
        e.preventDefault()
        navigate(ROUTE_MAP[key])
        lastKeyRef.current     = null
        lastKeyTimeRef.current = 0
        return
      }

      // Any other key — reset the chord state
      lastKeyRef.current     = null
      lastKeyTimeRef.current = 0
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  return { showHelp, setShowHelp }
}
