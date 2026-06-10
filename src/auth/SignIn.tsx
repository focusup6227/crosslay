import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Mode = 'link' | 'password'

export function SignIn() {
  const [mode, setMode] = useState<Mode>('link')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState<'link' | 'confirm' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
    } else {
      setSent('link')
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    setBusy(false)
    if (error) setError(error.message)
    // on success the auth listener swaps this screen out
  }

  async function signUpWithPassword() {
    if (!email.trim() || !password) {
      setError('Enter an email and password first')
      return
    }
    setError(null)
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) {
      setError(error.message)
    } else if (data.user?.identities?.length === 0) {
      setError('An account with this email already exists — sign in instead')
    } else if (!data.session) {
      setSent('confirm')
    }
    // if confirmation is disabled, data.session is set and the auth listener takes over
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <h1 className="font-display text-5xl font-bold uppercase tracking-wide text-hiviz-400">
        Crosslay
      </h1>
      <p className="mt-2 text-lg text-ash-300">Information, preconnected.</p>

      {sent ? (
        <div className="mt-10 w-full max-w-sm rounded-lg border border-night-600 bg-night-800 p-6 text-center">
          <p className="text-xl font-semibold">Check your email</p>
          <p className="mt-2 text-ash-300">
            {sent === 'link' ? 'We sent a sign-in link to ' : 'We sent a confirmation link to '}
            <span className="font-semibold text-ash-100">{email}</span>. Open it on this device.
          </p>
          <button
            className="mt-6 min-h-12 w-full rounded-md border border-night-600 px-4 text-lg font-semibold text-ash-300"
            onClick={() => setSent(null)}
          >
            Back
          </button>
        </div>
      ) : (
        <div className="mt-10 w-full max-w-sm">
          <div className="grid grid-cols-2 overflow-hidden rounded-md border border-night-600">
            <button
              className={`min-h-12 font-display text-base font-semibold uppercase tracking-wide ${
                mode === 'link' ? 'bg-hiviz-400 text-night-950' : 'bg-night-800 text-ash-300'
              }`}
              onClick={() => {
                setMode('link')
                setError(null)
              }}
            >
              Email link
            </button>
            <button
              className={`min-h-12 font-display text-base font-semibold uppercase tracking-wide ${
                mode === 'password' ? 'bg-hiviz-400 text-night-950' : 'bg-night-800 text-ash-300'
              }`}
              onClick={() => {
                setMode('password')
                setError(null)
              }}
            >
              Password
            </button>
          </div>

          <form onSubmit={mode === 'link' ? sendLink : signInWithPassword} className="mt-6">
            <label htmlFor="email" className="block text-sm font-semibold uppercase tracking-wider text-ash-500">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@department.gov"
              className="mt-2 min-h-12 w-full rounded-md border border-night-600 bg-night-800 px-4 text-lg text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
            />

            {mode === 'password' && (
              <>
                <label htmlFor="password" className="mt-4 block text-sm font-semibold uppercase tracking-wider text-ash-500">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-2 min-h-12 w-full rounded-md border border-night-600 bg-night-800 px-4 text-lg text-ash-100 placeholder:text-night-600 focus:border-hiviz-400 focus:outline-none"
                />
              </>
            )}

            {error && <p className="mt-3 text-oos-400">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="mt-4 min-h-14 w-full rounded-md bg-hiviz-400 px-4 font-display text-xl font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
            >
              {busy ? 'Working…' : mode === 'link' ? 'Send sign-in link' : 'Sign in'}
            </button>

            {mode === 'password' && (
              <button
                type="button"
                disabled={busy}
                onClick={signUpWithPassword}
                className="mt-3 min-h-12 w-full rounded-md border border-night-600 px-4 text-lg font-semibold text-ash-300 disabled:opacity-50"
              >
                Create account
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
