import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-time errors anywhere in the tree and shows a message instead
 * of letting the app collapse into a blank screen. (Module-load errors can't
 * be caught here, which is why config is gated separately in App.)
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-5xl font-bold uppercase tracking-wide text-hiviz-400">
            Crosslay
          </h1>
          <div className="mt-10 w-full max-w-sm rounded-lg border border-night-600 bg-night-800 p-6">
            <p className="text-xl font-semibold text-oos-400">Something went wrong</p>
            <p className="mt-3 text-ash-300">
              The app hit an unexpected error. Reload the page to try again.
            </p>
            <button
              className="mt-6 min-h-12 w-full rounded-md bg-hiviz-400 px-4 font-display text-lg font-semibold uppercase tracking-wide text-night-950"
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
