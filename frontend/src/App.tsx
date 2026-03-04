import { Box } from '@mui/material'
import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from '@/components/layout/Sidebar'
import TopBar from '@/components/layout/TopBar'
import Dashboard from '@/pages/Dashboard'
import MLModels from '@/pages/MLModels'
import Strategies from '@/pages/Strategies'
import Backtest from '@/pages/Backtest'
import Risk from '@/pages/Risk'
import Settings from '@/pages/Settings'

const SIDEBAR_WIDTH = 240

export default function App() {
  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Permanent sidebar */}
      <Sidebar width={SIDEBAR_WIDTH} />

      {/* Main area */}
      <Box
        sx={{
          flexGrow: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          ml: `${SIDEBAR_WIDTH}px`,
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
            <Route path="/"           element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"  element={<Dashboard />} />
            <Route path="/ml"         element={<MLModels />} />
            <Route path="/strategies" element={<Strategies />} />
            <Route path="/backtest"   element={<Backtest />} />
            <Route path="/risk"       element={<Risk />} />
            <Route path="/settings"   element={<Settings />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  )
}
