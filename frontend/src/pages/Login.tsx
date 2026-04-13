/**
 * Login page — Phase 17.
 *
 * Full-screen login form with Sign Up tab.
 * Only shown when JWT authentication is ENABLED on the backend.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import {
  ShowChart as LogoIcon,
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
  PersonAdd as PersonAddIcon,
} from '@mui/icons-material'
import axios from 'axios'
import { useAuth } from '@/contexts/AuthContext'

const API = import.meta.env.VITE_API_URL ?? ''

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [tab,      setTab]      = useState<0 | 1>(0)   // 0 = sign in, 1 = sign up
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [email,    setEmail]    = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const resetForm = () => {
    setUsername(''); setPassword(''); setConfirm(''); setEmail(''); setError(null)
  }

  const handleTabChange = (_: React.SyntheticEvent, v: 0 | 1) => {
    setTab(v); resetForm()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true); setError(null)
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid username or password.')
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return }
    setLoading(true); setError(null)
    try {
      const res = await axios.post<{ access_token: string }>(
        `${API}/api/auth/register`,
        { username, password, email: email || undefined },
      )
      // Auto-login after signup
      const token = res.data.access_token
      localStorage.setItem('trading_access_token', token)
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })
        ?.response?.data?.detail
      setError(msg ?? 'Registration failed. Username may already be taken.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card
        sx={{
          width: '100%',
          maxWidth: 420,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <CardContent sx={{ p: 4 }}>
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box
              sx={{
                width: 44,
                height: 44,
                borderRadius: 2,
                bgcolor: 'rgba(0,180,216,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LogoIcon sx={{ color: 'primary.main', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={700} lineHeight={1.1}>
                QuantStream
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Quant · ML · Live
              </Typography>
            </Box>
          </Box>

          <Tabs
            value={tab}
            onChange={handleTabChange}
            sx={{ mb: 3, borderBottom: '1px solid', borderColor: 'divider' }}
          >
            <Tab
              label="Sign in"
              icon={<LockIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              sx={{ minHeight: 40, textTransform: 'none', fontWeight: 600 }}
            />
            <Tab
              label="Sign up"
              icon={<PersonAddIcon sx={{ fontSize: 16 }} />}
              iconPosition="start"
              sx={{ minHeight: 40, textTransform: 'none', fontWeight: 600 }}
            />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {/* ── Sign In ── */}
          {tab === 0 && (
            <form onSubmit={handleLogin}>
              <Stack spacing={2.5}>
                <TextField
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  fullWidth
                  disabled={loading}
                  size="small"
                />
                <TextField
                  label="Password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  fullWidth
                  disabled={loading}
                  size="small"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPw((p) => !p)} edge="end">
                          {showPw ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading || !username || !password}
                  sx={{ py: 1.25, fontWeight: 700, textTransform: 'none' }}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </Button>
              </Stack>
            </form>
          )}

          {/* ── Sign Up ── */}
          {tab === 1 && (
            <form onSubmit={handleRegister}>
              <Stack spacing={2.5}>
                <TextField
                  label="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  fullWidth
                  disabled={loading}
                  size="small"
                />
                <TextField
                  label="Email (optional)"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  fullWidth
                  disabled={loading}
                  size="small"
                />
                <TextField
                  label="Password"
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  fullWidth
                  disabled={loading}
                  size="small"
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowPw((p) => !p)} edge="end">
                          {showPw ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <TextField
                  label="Confirm password"
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  fullWidth
                  disabled={loading}
                  size="small"
                />
                <Button
                  type="submit"
                  variant="contained"
                  fullWidth
                  disabled={loading || !username || !password || !confirm}
                  sx={{ py: 1.25, fontWeight: 700, textTransform: 'none' }}
                  startIcon={loading ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                  {loading ? 'Creating account…' : 'Create account'}
                </Button>
              </Stack>
            </form>
          )}

          <Divider sx={{ my: 3 }} />

          <Typography variant="caption" color="text.disabled" display="block">
            {tab === 0
              ? 'Forgot credentials? Regenerate the password hash and update ADMIN_PASSWORD_HASH in your .env file.'
              : 'New accounts are created with viewer permissions. An admin can promote roles in Settings → Users.'}
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}
