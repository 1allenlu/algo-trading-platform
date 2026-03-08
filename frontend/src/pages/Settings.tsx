/**
 * Settings Page — Phases 20, 21, 23.
 *
 * Panels:
 *   1. Notifications  (Phase 20) — email + Slack config, test buttons
 *   2. Scheduler      (Phase 21) — job table, next-run, Run Now buttons
 *   3. Users          (Phase 23) — user management (admin-only)
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import {
  Email as EmailIcon,
  PlayArrow as RunNowIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material'
import { api, NotificationConfig, JobStatus, UserInfo } from '@/services/api'

// ── Notifications panel ────────────────────────────────────────────────────────

function NotificationsPanel() {
  const [config, setConfig]     = useState<NotificationConfig | null>(null)
  const [testing, setTesting]   = useState<'email' | 'slack' | null>(null)
  const [result, setResult]     = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    api.notifications.getConfig().then(setConfig).catch(() => {})
  }, [])

  const sendTest = async (channel: 'email' | 'slack') => {
    setTesting(channel)
    setResult(null)
    try {
      const r = await api.notifications.test(channel)
      setResult(r)
    } catch {
      setResult({ ok: false, message: 'Request failed' })
    } finally {
      setTesting(null)
    }
  }

  if (!config) {
    return <CircularProgress size={24} />
  }

  return (
    <Stack spacing={2}>
      {result && (
        <Alert severity={result.ok ? 'success' : 'error'} onClose={() => setResult(null)}>
          {result.message}
        </Alert>
      )}

      {/* Email */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <EmailIcon fontSize="small" /> Email Notifications
              </Typography>
              {config.email_enabled ? (
                <Typography variant="body2" color="text.secondary">
                  Configured — sending to <b>{config.email_recipient}</b> via {config.smtp_host}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, NOTIFY_EMAIL in .env
                </Typography>
              )}
            </Box>
            <Button
              variant="outlined"
              size="small"
              disabled={!config.email_enabled || testing !== null}
              onClick={() => sendTest('email')}
              startIcon={testing === 'email' ? <CircularProgress size={14} /> : undefined}
            >
              Send Test
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Slack */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography fontWeight={600}>Slack Notifications</Typography>
              {config.slack_enabled ? (
                <Typography variant="body2" color="text.secondary">
                  Configured — webhook URL is set
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Not configured. Set SLACK_WEBHOOK_URL in .env
                </Typography>
              )}
            </Box>
            <Button
              variant="outlined"
              size="small"
              disabled={!config.slack_enabled || testing !== null}
              onClick={() => sendTest('slack')}
              startIcon={testing === 'slack' ? <CircularProgress size={14} /> : undefined}
            >
              Send Test
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  )
}

// ── Scheduler panel ────────────────────────────────────────────────────────────

function SchedulerPanel() {
  const [jobs, setJobs]       = useState<JobStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState<string | null>(null)

  const fetchJobs = useCallback(() => {
    api.scheduler.getJobs().then(setJobs).catch(() => {}).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchJobs() }, [fetchJobs])

  const runNow = async (jobId: string) => {
    setRunning(jobId)
    try {
      await api.scheduler.runNow(jobId)
      setTimeout(fetchJobs, 1000)
    } finally {
      setRunning(null)
    }
  }

  const statusColor = (s: string) =>
    s === 'ok' ? 'success' : s === 'error' ? 'error' : 'default'

  return (
    <Stack spacing={1}>
      <Stack direction="row" justifyContent="flex-end">
        <IconButton size="small" onClick={fetchJobs} disabled={loading}>
          <RefreshIcon fontSize="small" />
        </IconButton>
      </Stack>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {['Job', 'Next Run', 'Last Run', 'Status', 'Action'].map((h) => (
                <TableCell key={h} sx={{ color: 'primary.main', fontWeight: 600 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} align="center"><CircularProgress size={20} /></TableCell>
              </TableRow>
            ) : jobs.map((job) => (
              <TableRow key={job.job_id}>
                <TableCell>{job.name}</TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                  {job.next_run_time
                    ? new Date(job.next_run_time).toLocaleString()
                    : '—'}
                </TableCell>
                <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>
                  {job.last_run_at
                    ? new Date(job.last_run_at).toLocaleString()
                    : 'Never'}
                </TableCell>
                <TableCell>
                  <Chip
                    label={job.last_status}
                    size="small"
                    color={statusColor(job.last_status) as 'success' | 'error' | 'default'}
                    variant="outlined"
                    sx={{ fontSize: '0.7rem' }}
                  />
                </TableCell>
                <TableCell>
                  <Tooltip title="Run now">
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => runNow(job.job_id)}
                        disabled={running === job.job_id}
                      >
                        {running === job.job_id
                          ? <CircularProgress size={16} />
                          : <RunNowIcon fontSize="small" />}
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  )
}

// ── Users panel ────────────────────────────────────────────────────────────────

function UsersPanel() {
  const [users, setUsers]       = useState<UserInfo[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [newUser, setNewUser]   = useState({ username: '', password: '', email: '', role: 'viewer' })
  const [creating, setCreating] = useState(false)

  const fetchUsers = useCallback(() => {
    api.users.list().then(setUsers).catch((e) => setError(e.message)).finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const handleCreate = async () => {
    if (!newUser.username || !newUser.password) return
    setCreating(true)
    try {
      await api.users.create(newUser.username, newUser.password, newUser.email || undefined, newUser.role)
      setNewUser({ username: '', password: '', email: '', role: 'viewer' })
      fetchUsers()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }

  const handleDeactivate = async (userId: number) => {
    await api.users.deactivate(userId)
    fetchUsers()
  }

  if (error) return <Alert severity="error">{error}</Alert>

  return (
    <Stack spacing={2}>
      {/* Add user form */}
      <Card variant="outlined">
        <CardContent>
          <Typography fontWeight={600} sx={{ mb: 1.5 }}>Add User</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <TextField
              label="Username" size="small" value={newUser.username}
              onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
              sx={{ width: 150 }}
            />
            <TextField
              label="Password" size="small" type="password" value={newUser.password}
              onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
              sx={{ width: 150 }}
            />
            <TextField
              label="Email (optional)" size="small" value={newUser.email}
              onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
              sx={{ width: 200 }}
            />
            <TextField
              label="Role" size="small" select value={newUser.role}
              onChange={(e) => setNewUser((p) => ({ ...p, role: e.target.value }))}
              SelectProps={{ native: true }} sx={{ width: 110 }}
            >
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </TextField>
            <Button
              variant="contained" size="small" onClick={handleCreate}
              disabled={creating || !newUser.username || !newUser.password}
              startIcon={creating ? <CircularProgress size={14} /> : undefined}
            >
              Create
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* User list */}
      {loading ? (
        <CircularProgress size={24} />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Username', 'Email', 'Role', 'Status', 'Created', 'Last Login', 'Action'].map((h) => (
                  <TableCell key={h} sx={{ color: 'primary.main', fontWeight: 600, fontSize: '0.78rem' }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell sx={{ fontWeight: 600 }}>{u.username}</TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.78rem' }}>{u.email ?? '—'}</TableCell>
                  <TableCell>
                    <Chip
                      label={u.role} size="small"
                      color={u.role === 'admin' ? 'primary' : 'default'} variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={u.is_active ? 'active' : 'inactive'} size="small"
                      color={u.is_active ? 'success' : 'default'} variant="outlined"
                      sx={{ fontSize: '0.7rem' }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : 'Never'}
                  </TableCell>
                  <TableCell>
                    {u.is_active && (
                      <Button size="small" color="warning" variant="outlined"
                        onClick={() => handleDeactivate(u.id)} sx={{ fontSize: '0.7rem' }}>
                        Deactivate
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Settings() {
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>
        Settings
      </Typography>

      <Stack spacing={3}>
        {/* Notifications */}
        <Card>
          <CardHeader
            title="Alert Notifications"
            subheader="Send email or Slack messages when alert rules fire"
            titleTypographyProps={{ fontWeight: 600 }}
          />
          <Divider />
          <CardContent><NotificationsPanel /></CardContent>
        </Card>

        {/* Scheduler */}
        <Card>
          <CardHeader
            title="Data Pipeline Scheduler"
            subheader="Automated daily OHLCV ingestion and cleanup jobs"
            titleTypographyProps={{ fontWeight: 600 }}
          />
          <Divider />
          <CardContent><SchedulerPanel /></CardContent>
        </Card>

        {/* Users */}
        <Card>
          <CardHeader
            title="User Management"
            subheader="Manage accounts (admin only — returns empty list when auth is disabled)"
            titleTypographyProps={{ fontWeight: 600 }}
          />
          <Divider />
          <CardContent><UsersPanel /></CardContent>
        </Card>
      </Stack>
    </Box>
  )
}
