/**
 * Login page — Phase 17.
 *
 * Full-screen login form. Only shown when:
 *   1. JWT authentication is ENABLED on the backend (JWT_SECRET_KEY is set)
 *   2. The user is not authenticated (no valid token in localStorage)
 *
 * When auth is disabled on the backend, the app redirects automatically
 * to /dashboard after the auth check in AuthContext resolves.
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
  TextField,
  Typography,
} from '@mui/material'
import {
  ShowChart as LogoIcon,
  Visibility,
  VisibilityOff,
  Lock as LockIcon,
} from '@mui/icons-material'
import { useAuth } from '@/contexts/AuthContext'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setLoading(true)
    setError(null)
    try {
      await login(username, password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError('Invalid username or password.')
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 4 }}>
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
                TradingOS
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Quant · ML · Live
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
            <LockIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
            <Typography variant="h6" fontWeight={700}>
              Sign in
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Enter your credentials to access the trading platform.
          </Typography>

          <Divider sx={{ mb: 3 }} />

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
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
                      <IconButton
                        size="small"
                        onClick={() => setShowPw((p) => !p)}
                        edge="end"
                      >
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

          <Box sx={{ mt: 3, pt: 3, borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="caption" color="text.disabled" display="block">
              Forgot credentials? Regenerate the password hash and update ADMIN_PASSWORD_HASH in your .env file.
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'Roboto Mono, monospace', display: 'block', mt: 0.5 }}>
              POST /api/auth/hash {"{ \"password\": \"newpass\" }"}
            </Typography>
          </Box>
        </CardContent>
      </Card>
    </Box>
  )
}
