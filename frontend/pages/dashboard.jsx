import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import supabase from '../lib/supabaseClient'
const Auth = dynamic(() => import('../components/Auth'), { ssr: false })

const VoiceTutor = dynamic(() => import('../components/VoiceTutor'), { ssr: false })

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [conversations, setConversations] = useState([]) // [{id,title,messages,createdAt}]
  const [selectedId, setSelectedId] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const router = useRouter()

  // Load session and conversation for this user
  useEffect(() => {
    let mounted = true
    const init = async () => {
      const { data } = await supabase.auth.getSession()
      const u = data?.session?.user ?? null
      if (!mounted) return
      setUser(u)
      setInitializing(false)
      if (!u) return // wait for auth state change before redirecting

      try {
        // Migration: if old single-conversation key exists, migrate it
        const oldRaw = localStorage.getItem(`conversation:${u.id}`)
        const newRaw = localStorage.getItem(`conversations:${u.id}`)
        if (!newRaw && oldRaw) {
          const msgs = JSON.parse(oldRaw)
          const conv = { id: `c-${Date.now()}`, title: 'Conversation 1', messages: msgs || [], createdAt: Date.now() }
          localStorage.setItem(`conversations:${u.id}`, JSON.stringify([conv]))
          localStorage.setItem(`conversations:selected:${u.id}`, conv.id)
          setConversations([conv])
          setSelectedId(conv.id)
        } else if (newRaw) {
          const arr = JSON.parse(newRaw)
          setConversations(arr || [])
          const sel = localStorage.getItem(`conversations:selected:${u.id}`) || (arr && arr[0]?.id) || null
          setSelectedId(sel)
        } else {
          // no previous data: initialize an empty conversation list
          const conv = { id: `c-${Date.now()}`, title: 'Conversation 1', messages: [], createdAt: Date.now() }
          setConversations([conv])
          setSelectedId(conv.id)
        }
      } catch (e) {
        console.warn('Could not load conversations', e)
      }
    }
    init()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      // if user signed out, go to home
      if (event === 'SIGNED_OUT') router.push('/')
      setUser(u)
    })
    return () => { sub?.subscription?.unsubscribe?.(); mounted = false }
  }, [router])

  // persist conversations + selected id
  useEffect(() => {
    if (!user) return
    try {
      localStorage.setItem(`conversations:${user.id}`, JSON.stringify(conversations))
      if (selectedId) localStorage.setItem(`conversations:selected:${user.id}`, selectedId)
    } catch (e) {}
  }, [conversations, selectedId, user])

  const handleTranscript = (text) => {
    const entry = { role: 'user', text }
    setConversations((list) => list.map((c) => c.id === selectedId ? { ...c, messages: [...c.messages, entry] } : c))
  }

  const getSelectedConversation = () => conversations.find((c) => c.id === selectedId) || null

  const createConversation = (title) => {
    const conv = { id: `c-${Date.now()}`, title: title || `Conversation ${conversations.length + 1}`, messages: [], createdAt: Date.now() }
    setConversations((s) => [conv, ...s])
    setSelectedId(conv.id)
  }

  const renameConversation = (id) => {
    const c = conversations.find((x) => x.id === id)
    if (!c) return
    const newTitle = prompt('New title', c.title)
    if (!newTitle) return
    setConversations((s) => s.map((x) => x.id === id ? { ...x, title: newTitle } : x))
  }

  const deleteConversation = (id) => {
    if (!confirm('Delete this conversation?')) return
    setConversations((s) => {
      const next = s.filter((x) => x.id !== id)
      if (next.length === 0) {
        const conv = { id: `c-${Date.now()}`, title: 'Conversation 1', messages: [], createdAt: Date.now() }
        setSelectedId(conv.id)
        return [conv]
      }
      if (id === selectedId) setSelectedId(next[0].id)
      return next
    })
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (initializing) return <div>Loading…</div>

  if (!user) {
    return (
      <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h1>Dashboard</h1>
        <p>Please sign in to access your dashboard.</p>
        <Auth onUser={setUser} redirectTo="/dashboard" />
      </main>
    )
  }

  return (
    <main className="dashboard">
      <div className="topbar">
        <h1>Dashboard</h1>
        <div className="userBadge">
          <strong>{user.user_metadata?.full_name || user.email}</strong>
          <button onClick={signOut} className="secondary">Sign out</button>
        </div>
      </div>

      <p style={{ marginTop: 8 }}>This is your personal workspace. Conversation is stored locally per account for now.</p>

      <section className="panel">
        <div className="controls">
          <label style={{ marginRight: 8 }}>Conversation</label>
          <select value={selectedId || ''} onChange={(e) => setSelectedId(e.target.value)}>
            {conversations.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button onClick={() => createConversation()}>New</button>
          <button onClick={() => renameConversation(selectedId)} className="secondary" disabled={!selectedId}>Rename</button>
          <button onClick={() => deleteConversation(selectedId)} className="danger" disabled={!selectedId}>Delete</button>
        </div>

        <div style={{ marginTop: 12 }}>
          <VoiceTutor onTranscript={handleTranscript} />
        </div>

        <div style={{ marginTop: 20 }} className="conversation">
          <h2>Conversation</h2>
          <div>
            {getSelectedConversation()?.messages?.map((m, i) => (
              <div key={i} className={`message ${m.role === 'user' ? 'user' : 'assistant'}`}><strong>{m.role}:</strong> {m.text}</div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
