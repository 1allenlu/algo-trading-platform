import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Box, useMediaQuery, useTheme } from '@mui/material'
import { Route, Routes } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import Dashboard from '@/pages/Dashboard'
import MLModels from '@/pages/MLModels'
import Strategies from '@/pages/Strategies'
import Backtest from '@/pages/Backtest'
import Risk from '@/pages/Risk'
import Trading from '@/pages/Trading'
import Settings from '@/pages/Settings'
import AlertsPage from '@/pages/Alerts'
import AnalyticsPage from '@/pages/Analytics'
import OptimizePage from '@/pages/Optimize'
import ScannerPage from '@/pages/Scanner'
import AutoTradePage from '@/pages/AutoTrade'
import SignalsPage from '@/pages/Signals'
import NewsPage from '@/pages/News'
import OptionsPage from '@/pages/Options'
import CryptoPage from '@/pages/Crypto'
import EarningsPage from '@/pages/Earnings'
import JournalPage from '@/pages/Journal'
import FundamentalsPage from '@/pages/Fundamentals'
import PatternsPage from '@/pages/Patterns'
import RLAgentPage from '@/pages/RLAgent'
import ComparePage from '@/pages/Compare'
import WatchlistPage from '@/pages/Watchlist'
import RebalancePage from '@/pages/Rebalance'
import TaxReportPage from '@/pages/TaxReport'
import StrategyBuilderPage from '@/pages/StrategyBuilder'
import TournamentPage from '@/pages/Tournament'
import SharedPortfolioPage from '@/pages/SharedPortfolio'
import LoginPage from '@/pages/Login'
import IntroPage from '@/pages/Intro'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { useKeyboardShortcuts, ShortcutHelpModal } from '@/hooks/useKeyboardShortcuts'

const SIDEBAR_WIDTH = 240

/**
 * Inner layout for all authenticated/app pages.
 * Wraps content with the permanent sidebar + top bar.
 */
function AppLayout() {
  const theme        = useTheme()
  const isMobile     = useMediaQuery(theme.breakpoints.down('md'))
  const [mobileOpen, setMobileOpen] = useState(false)

  // Global keyboard shortcuts — G+letter navigation, ? for help modal
  const { showHelp, setShowHelp } = useKeyboardShortcuts()

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar — permanent on desktop, temporary drawer on mobile */}
      <Sidebar
        width={SIDEBAR_WIDTH}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main area: top bar + scrollable page content */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          // On mobile the sidebar is overlaid (temporary), so no left margin needed
          width: { xs: '100%', md: `calc(100% - ${SIDEBAR_WIDTH}px)` },
        }}
      >
        <TopBar onMenuClick={isMobile ? () => setMobileOpen(true) : undefined} />

        <Box
          component="main"
          sx={{
            flexGrow: 1,
            overflow: 'auto',
            p: 3,
            bgcolor: 'background.default',
          }}
        >
          <Routes>
            <Route path="/dashboard"  element={<Dashboard />} />
            <Route path="/ml"         element={<MLModels />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/backtest"   element={<Backtest />} />
            <Route path="/risk"       element={<Risk />} />
            <Route path="/trading"    element={<Trading />} />
            <Route path="/options"    element={<OptionsPage />} />
            <Route path="/alerts"     element={<AlertsPage />} />
            <Route path="/analytics"  element={<AnalyticsPage />} />
            <Route path="/optimize"   element={<OptimizePage />} />
            <Route path="/scanner"    element={<ScannerPage />} />
            <Route path="/autotrade"  element={<AutoTradePage />} />
            <Route path="/signals"    element={<SignalsPage />} />
            <Route path="/news"       element={<NewsPage />} />
            <Route path="/crypto"     element={<CryptoPage />} />
            <Route path="/earnings"   element={<EarningsPage />} />
            <Route path="/journal"       element={<JournalPage />} />
            <Route path="/fundamentals" element={<FundamentalsPage />} />
            <Route path="/patterns"     element={<PatternsPage />} />
            <Route path="/rl"           element={<RLAgentPage />} />
            <Route path="/compare"      element={<ComparePage />} />
            <Route path="/watchlist"    element={<WatchlistPage />} />
            <Route path="/rebalance"         element={<RebalancePage />} />
            <Route path="/tax"              element={<TaxReportPage />} />
            <Route path="/strategy-builder" element={<StrategyBuilderPage />} />
            <Route path="/tournament"       element={<TournamentPage />} />
            <Route path="/settings"         element={<Settings />} />
          </Routes>
        </Box>
      </Box>

      {/* Keyboard shortcuts help modal — toggled by pressing ? */}
      <ShortcutHelpModal open={showHelp} onClose={() => setShowHelp(false)} />
    </Box>
  )
}

/**
 * Route guard — redirects unauthenticated users to /login when JWT
 * auth is enabled on the backend.  Passes through when auth is disabled.
 */
function ProtectedAppLayout() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <AppLayout />
}

/**
 * Root router.
 * - "/"       → full-screen Intro page (no sidebar/topbar)
 * - "/login"  → login page (shown when auth is enabled)
 * - "/*"      → AppLayout (protected by ProtectedAppLayout)
 */
function AppRoutes() {
  return (
    <Routes>
      <Route path="/"            element={<IntroPage />} />
      <Route path="/login"       element={<LoginPage />} />
      {/* Phase 54: public share page — no auth, no sidebar */}
      <Route path="/share/:token" element={<SharedPortfolioPage />} />
      <Route path="/*"           element={<ProtectedAppLayout />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}
