/**
 * Shown when the Supabase environment variables are missing. Without these the
 * app cannot talk to the backend, so instead of crashing to a blank screen we
 * surface an actionable message. In production this means the deployment (e.g.
 * Vercel) is missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 */
export function ConfigError() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-5xl font-bold uppercase tracking-wide text-hiviz-400">
        Crosslay
      </h1>
      <div className="mt-10 w-full max-w-sm rounded-lg border border-night-600 bg-night-800 p-6">
        <p className="text-xl font-semibold text-oos-400">Configuration error</p>
        <p className="mt-3 text-ash-300">
          The app is missing its Supabase connection settings. Set{' '}
          <span className="font-semibold text-ash-100">VITE_SUPABASE_URL</span> and{' '}
          <span className="font-semibold text-ash-100">VITE_SUPABASE_ANON_KEY</span> in the
          deployment environment, then redeploy.
        </p>
      </div>
    </div>
  )
}
