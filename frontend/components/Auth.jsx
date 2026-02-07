import { useEffect, useState } from 'react'
import supabase from '../lib/supabaseClient'
import { useRouter } from 'next/router'

export default function Auth({ onUser, redirectTo = '/dashboard' }) {
  const [user, setUser] = useState(null)
  const [error, setError] = useState(null)
  const router = useRouter()
  const [initializing, setInitializing] = useState(true)
  const [email, setEmail] = useState('')
  const [magicMsg, setMagicMsg] = useState(null)

  useEffect(() => {
    let mounted = true

    // If the URL contains OAuth fragment with tokens (access_token), parse it
    // and set the session manually so the client recognizes the logged-in user.
    const tryRestoreFromHash = async () => {
      if (typeof window === 'undefined') return
      const hash = window.location.hash || ''
      if (!hash.includes('access_token')) return

      const params = Object.fromEntries(
        hash.replace(/^#/, '').split('&').map(pair => pair.split('=').map(decodeURIComponent))
      )
      const access_token = params.access_token
      const refresh_token = params.refresh_token
      if (access_token) {
        try {
          await supabase.auth.setSession({ access_token, refresh_token })
        } catch (e) {
          console.error('Error setting session from URL hash', e)
          setError(e?.message || String(e))
        }
      }

      // Clean URL to avoid re-processing on future loads
      try {
        const cleaned = window.location.origin + window.location.pathname
        window.history.replaceState({}, document.title, cleaned)
      } catch (e) { }
    }

    // Attempt to restore session from URL hash, then load current session.
    tryRestoreFromHash().finally(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!mounted) return
        const u = data.session?.user ?? null
        setUser(u)
        onUser && onUser(u)
        setInitializing(false)
        if (u && redirectTo) {
          try { router.replace(redirectTo) } catch (e) { }
        }
      })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      onUser && onUser(u)
    })

    return () => {
      mounted = false
      subscription?.subscription?.unsubscribe?.()
    }
  }, [onUser, router])

  const signInWithGoogle = async () => {
    try {
      setError(null)
      // Start OAuth and request Supabase redirect back to the chosen path.
      // Redirect to our server callback which will perform the token exchange
      const callbackUrl = typeof window !== 'undefined'
        ? window.location.origin + `/api/auth/callback${redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : ''}`
        : undefined
      console.log('Initiating OAuth with callbackUrl:', callbackUrl)
      await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl } })
    } catch (e) {
      console.error('Sign-in error', e)
      setError(e?.message || String(e))
    }
  }

  const signInWithEmail = async () => {
    try {
      setError(null)
      setMagicMsg(null)
      if (!email) return setError('Enter an email address')
      const redirectUrl = typeof window !== 'undefined' && redirectTo ? window.location.origin + redirectTo : undefined
      const { data, error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectUrl } })
      if (error) throw error
      setMagicMsg('Magic link sent to ' + email + '. Check your inbox.')
    } catch (e) {
      console.error('Email sign-in error', e)
      setError(e?.message || String(e))
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  const continueAsDemo = () => {
    const demo = { id: 'dev', email: 'dev@local', user_metadata: { full_name: 'Demo User' } }
    setUser(demo)
    onUser && onUser(demo)
    try { window.localStorage.setItem('demo_user', JSON.stringify(demo)) } catch (e) { }
    try { const redirectUrl = typeof window !== 'undefined' && redirectTo ? window.location.origin + redirectTo : '/'; window.location.replace(redirectUrl) } catch (e) { }
  }

  if (initializing) return <div>Loading…</div>

  if (!user) {
    return (
      <div>
        <button onClick={signInWithGoogle} style={{ padding: '8px 12px' }}>
          Sign in with Google
        </button>
        {error && (
          <div style={{ marginTop: 8, color: 'crimson' }}>
            Error: {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <div>
        <strong>{user.user_metadata?.full_name || user.email}</strong>
      </div>
      <button onClick={signOut} style={{ padding: '6px 10px' }}>
        Sign out
      </button>
    </div>
  )
}
