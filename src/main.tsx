import { Component, StrictMode } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

/**
 * Last-resort boundary: without it, any error thrown during render leaves the
 * user staring at a blank page with no clue what broke.
 */
class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-4xl font-bold uppercase tracking-wide text-hiviz-400">
            Crosslay
          </h1>
          <div className="mt-8 w-full max-w-sm rounded-lg border border-oos-600 bg-night-800 p-6">
            <p className="text-xl font-semibold text-oos-400">Something went wrong</p>
            <p className="mt-3 text-ash-300">{this.state.error.message}</p>
            <button
              className="mt-6 min-h-12 w-full rounded-md border border-night-600 px-4 text-lg font-semibold text-ash-300"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
