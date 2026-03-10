/**
 * Auth Context — Phase 17.
 *
 * Provides JWT token management for the entire app:
 *   - Token stored in localStorage (persists across refreshes)
 *   - Axios interceptor injects Bearer token into every request
 *   - 401 responses automatically redirect to /login
 *   - When JWT_SECRET_KEY is not configured on the backend, auth is
 *     disabled and the app behaves as if always logged in
 *
 * Usage:
 *   const { user, login, logout, isAuthenticated } = useAuth()
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import axios from 'axios'

const TOKEN_KEY = 'trading_access_token'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user:            string | null   // username, or null when not logged in
  isAuthenticated: boolean
  authEnabled:     boolean         // false when backend has no JWT_SECRET_KEY
  login:  (username: string, password: string) => Promise<void>
  logout: () => void
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user:            null,
  isAuthenticated: false,
  authEnabled:     true,
  login:           async () => {},
  logout:          () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]             = useState<string | null>(null)
  const [authEnabled, setAuthEnabled] = useState(true)   // assume enabled until /me responds
  const [ready, setReady]           = useState(false)    // prevent flash before /me resolves

  // Read token from localStorage on mount, verify with /api/auth/me
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY)
    if (token) {
      // Inject header so the /me call below uses it
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    }

    axios
      .get<{ username: string; auth_enabled: boolean }>(
        `${import.meta.env.VITE_API_URL ?? ''}/api/auth/me`,
      )
      .then(({ data }) => {
        setAuthEnabled(data.auth_enabled)
        if (!data.auth_enabled) {
          // Auth disabled on backend — always treat as logged in
          setUser('admin')
        } else if (token) {
          setUser(data.username)
        }
      })
      .catch(() => {
        // /me failed — token invalid or network error; stay logged out
        localStorage.removeItem(TOKEN_KEY)
        delete axios.defaults.headers.common['Authorization']
        setUser(null)
      })
      .finally(() => setReady(true))
  }, [])

  // Attach axios request interceptor to add Bearer token to every request
  useEffect(() => {
    const id = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err.response?.status === 401 && authEnabled) {
          // Token expired or invalid — force re-login
          localStorage.removeItem(TOKEN_KEY)
          delete axios.defaults.headers.common['Authorization']
          setUser(null)
          // Redirect to login (outside React Router — simplest approach)
          if (window.location.pathname !== '/login') {
            window.location.replace('/login')
          }
        }
        return Promise.reject(err)
      },
    )
    return () => axios.interceptors.response.eject(id)
  }, [authEnabled])

  const login = useCallback(async (username: string, password: string) => {
    const res = await axios.post<{ access_token: string }>(
      `${import.meta.env.VITE_API_URL ?? ''}/api/auth/login`,
      { username, password },
    )
    const token = res.data.access_token
    localStorage.setItem(TOKEN_KEY, token)
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(username)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    delete axios.defaults.headers.common['Authorization']
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !authEnabled || user !== null,
      authEnabled,
      login,
      logout,
    }),
    [user, authEnabled, login, logout],
  )

  // Don't render children until we've checked the stored token
  if (!ready) return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a0e1a', color: '#9CA3AF', fontFamily: 'monospace', fontSize: 14 }}>
      Loading…
    </div>
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth() {
  return useContext(AuthContext)
}
