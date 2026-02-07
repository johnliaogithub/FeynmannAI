import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import supabase from '../lib/supabaseClient'
const Auth = dynamic(() => import('../components/Auth'), { ssr: false })

const VoiceTutor = dynamic(() => import('../components/VoiceTutor'), { ssr: false })
const RecorderUpload = dynamic(() => import('../components/RecorderUpload'), { ssr: false })

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [conversations, setConversations] = useState([]) // [{id,title,messages,createdAt}]
  const [selectedId, setSelectedId] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const messagesRef = useRef(null)
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

  // auto-scroll messages container to bottom on new messages / selection change (smooth)
  useEffect(() => {
    try {
      const el = messagesRef.current
      if (!el) return
      // smooth scroll to bottom
      if ('scrollTo' in el) {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    } catch (e) {}
  }, [conversations, selectedId])

  const handleTranscript = (text) => {
    const entry = { role: 'user', text }
    setConversations((list) => list.map((c) => c.id === selectedId ? { ...c, messages: [...c.messages, entry] } : c))
  }

  // send transcript to backend chat endpoint and append Gemini reply
  const handleTranscriptAndChat = async (text) => {
    if (!text) return
    const userEntry = { role: 'user', text }
    const pendingAssistant = { role: 'assistant', text: 'Thinking...', _pending: true }
    setConversations((list) => list.map((c) => c.id === selectedId ? { ...c, messages: [...c.messages, userEntry, pendingAssistant] } : c))

    try {
      const res = await fetch('/api/proxy-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Server ${res.status}: ${txt}`)
      }
      const data = await res.json().catch(() => ({}))
      const reply = data?.response || data?.transcription || data?.text || ''
      const final = reply && reply.trim() ? reply : '[no reply]'

      // replace the pending assistant message with final reply
      setConversations((list) => list.map((c) => {
        if (c.id !== selectedId) return c
        const msgs = c.messages.map((m) => m._pending ? ({ role: 'assistant', text: final }) : m)
        return { ...c, messages: msgs }
      }))
    } catch (e) {
      console.error('Chat error', e)
      const errText = `Error: ${e.message || 'chat failed'}`
      setConversations((list) => list.map((c) => {
        if (c.id !== selectedId) return c
        const msgs = c.messages.map((m) => m._pending ? ({ role: 'assistant', text: errText }) : m)
        return { ...c, messages: msgs }
      }))
    }
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
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-72 bg-slate-800 border-r border-slate-700 min-h-screen p-4 flex flex-col">
          <div>
            <div className="flex items-center justify-between mb-4">
              <center>
              <h2 className="text-lg font-semibold">Conversations</h2>
              </center>
            </div>

            <div className="space-y-2">
              {conversations.map((c) => (
                <div key={c.id} onClick={() => setSelectedId(c.id)} className={`p-2 rounded-md cursor-pointer ${c.id === selectedId ? 'bg-slate-700 ring-2 ring-primary/40' : 'hover:bg-slate-700'}`}>
                  <div className="flex justify-between items-center">
                    <div className="truncate">{c.title}</div>
                    <div className="text-xs text-slate-400">{c.messages.length}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <button onClick={() => createConversation()} className="w-full px-3 py-2 rounded-md bg-primary text-slate-900 font-medium">New Conversation</button>
            </div>
          </div>

          <div className="mt-auto">
            <button onClick={signOut} className="w-full px-3 py-2 rounded-md bg-slate-700 text-sm">Sign out</button>
          </div>
        </aside>

        {/* Main chat area */}
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto">
            <header className="flex items-center justify-between">
              <h1 className="text-2xl font-bold">{getSelectedConversation()?.title || 'Conversation'}</h1>
              <div className="flex items-center gap-2">
                <button onClick={() => renameConversation(selectedId)} className="px-3 py-1 bg-slate-800 rounded-md text-sm" disabled={!selectedId}>Rename</button>
                <button onClick={() => deleteConversation(selectedId)} className="px-3 py-1 bg-rose-600 rounded-md text-sm" disabled={!selectedId}>Delete</button>
              </div>
            </header>

            <section className="mt-6 bg-slate-800 rounded-lg p-4 h-[640px]">
              <div ref={messagesRef} className="h-full overflow-y-auto pr-2 flex flex-col gap-3">
                {getSelectedConversation()?.messages?.map((m, i) => {
                  const firstName = (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'You')?.split?.(' ')[0] || 'You'
                  const label = m.role === 'user' ? firstName : (m.role === 'assistant' ? 'Clueless Learner' : m.role)
                  return (
                    <div key={i} className={`p-3 rounded-md ${m.role === 'user' ? 'bg-slate-700 text-slate-100 self-end' : 'bg-slate-700/60 text-slate-200'}`}>
                      <div className="text-sm"><strong>{label}</strong></div>
                      <div className="mt-1">{m.text}</div>
                    </div>
                  )
                })}
              </div>
            </section>

            <footer className="mt-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <RecorderUpload endpoint="http://127.0.0.1:8000/transcribe-audio/" onTranscribed={(txt) => {
                    // when a transcription arrives, append as user message and call backend chat
                    handleTranscriptAndChat(txt)
                  }} />
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}
