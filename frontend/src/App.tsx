import { Box } from '@mui/material'
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
import IntroPage from '@/pages/Intro'

const SIDEBAR_WIDTH = 240

/**
 * Inner layout for all authenticated/app pages.
 * Wraps content with the permanent sidebar + top bar.
 */
function AppLayout() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Permanent sidebar */}
      <Sidebar width={SIDEBAR_WIDTH} />

      {/* Main area: top bar + scrollable page content */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <TopBar />

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
            <Route path="/alerts"     element={<AlertsPage />} />
            <Route path="/analytics"  element={<AnalyticsPage />} />
            <Route path="/optimize"   element={<OptimizePage />} />
            <Route path="/scanner"    element={<ScannerPage />} />
            <Route path="/autotrade"  element={<AutoTradePage />} />
            <Route path="/settings"   element={<Settings />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  )
}

/**
 * Root router.
 * - "/" renders the full-screen Intro page (no sidebar/topbar)
 * - Everything else renders inside AppLayout
 */
export default function App() {
  return (
    <Routes>
      <Route path="/"    element={<IntroPage />} />
      <Route path="/*"   element={<AppLayout />} />
    </Routes>
  )
}
