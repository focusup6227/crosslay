import { useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSending(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    setSending(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
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
            We sent a sign-in link to <span className="font-semibold text-ash-100">{email}</span>.
            Open it on this device.
          </p>
          <button
            className="mt-6 min-h-12 w-full rounded-md border border-night-600 px-4 text-lg font-semibold text-ash-300"
            onClick={() => setSent(false)}
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} className="mt-10 w-full max-w-sm">
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
          {error && <p className="mt-3 text-oos-400">{error}</p>}
          <button
            type="submit"
            disabled={sending}
            className="mt-4 min-h-14 w-full rounded-md bg-hiviz-400 px-4 font-display text-xl font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send sign-in link'}
          </button>
        </form>
      )}
    </div>
  )
}
