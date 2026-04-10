/**
 * Multi-Portfolio Management — Phase 67.
 *
 * Named paper accounts: create, view, and delete portfolios.
 * The "Default" portfolio (is_default = true) cannot be deleted.
 */

import { useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TextField, Tooltip, Typography,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Star as DefaultIcon,
} from '@mui/icons-material'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, type PortfolioMeta } from '@/services/api'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName]         = useState('')
  const [desc, setDesc]         = useState('')
  const [cash, setCash]         = useState('100000')
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: () => api.portfolios.create(name.trim(), desc.trim() || undefined, Number(cash)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolios'] })
      setName(''); setDesc(''); setCash('100000')
      onClose()
    },
  })

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Create Portfolio</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField
          label="Name" size="small" fullWidth required
          value={name} onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="Description (optional)" size="small" fullWidth
          value={desc} onChange={(e) => setDesc(e.target.value)}
        />
        <TextField
          label="Starting Cash ($)" size="small" fullWidth type="number"
          value={cash} onChange={(e) => setCash(e.target.value)}
          inputProps={{ min: 1000 }}
        />
        {create.isError && (
          <Alert severity="error" sx={{ py: 0 }}>Failed to create portfolio.</Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} size="small">Cancel</Button>
        <Button
          variant="contained" size="small" disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default function PortfoliosPage() {
  const [createOpen, setCreateOpen] = useState(false)
  const qc = useQueryClient()

  const { data = [], isLoading, error } = useQuery<PortfolioMeta[]>({
    queryKey:  ['portfolios'],
    queryFn:   () => api.portfolios.list(),
    staleTime: 60_000,
  })

  const del = useMutation({
    mutationFn: (id: number) => api.portfolios.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }),
  })

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h5" fontWeight={700}>Portfolios</Typography>
          <Typography variant="body2" color="text.secondary">
            Manage named paper trading accounts. Each portfolio is an independent $100k+ simulator.
          </Typography>
        </Box>
        <Button
          variant="contained" size="small" startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
        >
          New Portfolio
        </Button>
      </Box>

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error">Failed to load portfolios.</Alert>}

      {data.length > 0 && (
        <Card sx={{ border: '1px solid', borderColor: 'divider' }}>
          <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    {['Name', 'Description', 'Starting Cash', 'Created', 'Type', ''].map((h) => (
                      <TableCell key={h} sx={{ fontWeight: 700, fontSize: '0.72rem', color: 'text.secondary' }}>
                        {h}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.map((p) => (
                    <TableRow key={p.id} hover>
                      <TableCell sx={{ fontWeight: 700, color: 'primary.main' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {p.is_default && (
                            <Tooltip title="Default portfolio — cannot be deleted">
                              <DefaultIcon sx={{ fontSize: 14, color: '#F59E0B' }} />
                            </Tooltip>
                          )}
                          {p.name}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem', maxWidth: 200 }}>
                        {p.description ?? '—'}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.8rem' }}>
                        {fmt(p.starting_cash)}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {new Date(p.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small" label={p.is_default ? 'Default' : 'Custom'}
                          sx={{
                            height: 18, fontSize: '0.65rem', fontWeight: 700,
                            bgcolor: p.is_default ? '#F59E0B22' : '#4A9EFF22',
                            color:   p.is_default ? '#F59E0B'   : '#4A9EFF',
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {!p.is_default && (
                          <Tooltip title="Delete portfolio">
                            <IconButton
                              size="small" color="error"
                              onClick={() => del.mutate(p.id)}
                              disabled={del.isPending}
                            >
                              <DeleteIcon sx={{ fontSize: 16 }} />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {!isLoading && data.length === 0 && !error && (
        <Alert severity="info">No portfolios found. Create one to get started.</Alert>
      )}

      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Box>
  )
}
