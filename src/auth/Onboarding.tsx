import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthProvider'

type Mode = 'join' | 'create'

export function Onboarding() {
  const { refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('join')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
  const [deptName, setDeptName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData.user?.id
      if (!userId) throw new Error('Not signed in')

      if (displayName.trim()) {
        const { error: nameErr } = await supabase
          .from('profiles')
          .update({ display_name: displayName.trim() })
          .eq('id', userId)
        if (nameErr) throw nameErr
      }

      const { error: rpcErr } =
        mode === 'join'
          ? await supabase.rpc('join_department', { code: code.trim() })
          : await supabase.rpc('create_department', { dept_name: deptName.trim() })
      if (rpcErr) throw rpcErr

      await refreshProfile()
      navigate('/map', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong — try again')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6">
      <h1 className="font-display text-3xl font-semibold uppercase tracking-wide text-hiviz-400">
        Crosslay
      </h1>

      <div className="mt-8 w-full max-w-sm">
        <div className="grid grid-cols-2 overflow-hidden rounded-md border border-night-600">
          <button
            className={`min-h-12 font-display text-base font-semibold uppercase tracking-wide ${
              mode === 'join' ? 'bg-hiviz-400 text-night-950' : 'bg-night-800 text-ash-300'
            }`}
            onClick={() => setMode('join')}
          >
            Join department
          </button>
          <button
            className={`min-h-12 font-display text-base font-semibold uppercase tracking-wide ${
              mode === 'create' ? 'bg-hiviz-400 text-night-950' : 'bg-night-800 text-ash-300'
            }`}
            onClick={() => setMode('create')}
          >
            Start new
          </button>
        </div>

        <form onSubmit={submit} className="mt-6">
          <label htmlFor="displayName" className="block text-sm font-semibold uppercase tracking-wider text-ash-500">
            Your name
          </label>
          <input
            id="displayName"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="J. Smith"
            autoComplete="name"
            className="mt-2 min-h-12 w-full rounded-md border border-night-600 bg-night-800 px-4 text-lg focus:border-hiviz-400 focus:outline-none"
          />

          {mode === 'join' ? (
            <>
              <label htmlFor="code" className="mt-4 block text-sm font-semibold uppercase tracking-wider text-ash-500">
                Department invite code
              </label>
              <input
                id="code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ab12cd34ef56"
                autoCapitalize="none"
                autoCorrect="off"
                className="mt-2 min-h-12 w-full rounded-md border border-night-600 bg-night-800 px-4 font-mono text-lg tracking-widest focus:border-hiviz-400 focus:outline-none"
              />
              <p className="mt-2 text-sm text-ash-500">Get this from your department admin.</p>
            </>
          ) : (
            <>
              <label htmlFor="deptName" className="mt-4 block text-sm font-semibold uppercase tracking-wider text-ash-500">
                Department name
              </label>
              <input
                id="deptName"
                required
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                placeholder="Pleasantville Fire Department"
                className="mt-2 min-h-12 w-full rounded-md border border-night-600 bg-night-800 px-4 text-lg focus:border-hiviz-400 focus:outline-none"
              />
              <p className="mt-2 text-sm text-ash-500">
                You'll be the admin and get an invite code to share with your crew.
              </p>
            </>
          )}

          {error && <p className="mt-3 text-oos-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 min-h-14 w-full rounded-md bg-hiviz-400 px-4 font-display text-xl font-semibold uppercase tracking-wide text-night-950 disabled:opacity-50"
          >
            {busy ? 'Working…' : mode === 'join' ? 'Join' : 'Create department'}
          </button>
        </form>

        <button onClick={signOut} className="mt-6 min-h-12 w-full text-ash-500 underline">
          Sign out
        </button>
      </div>
    </div>
  )
}
