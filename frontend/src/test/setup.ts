/**
 * Vitest global setup — runs before every test file.
 *
 * 1. Extends expect() with @testing-library/jest-dom matchers
 *    (toBeInTheDocument, toHaveTextContent, etc.)
 * 2. Clears localStorage between tests to prevent cross-test pollution.
 * 3. Suppresses noisy console.error from React act() warnings in tests.
 */

import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Clean up rendered components after each test
afterEach(() => {
  cleanup()
  localStorage.clear()
})

// Silence act() and prop-type warnings that aren't relevant to test assertions
const originalError = console.error.bind(console.error)
console.error = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : ''
  if (
    msg.includes('act(') ||
    msg.includes('Warning:') ||
    msg.includes('ReactDOM.render')
  ) return
  originalError(...args)
}
