import { useEffect, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/router'
import supabase from '../lib/supabaseClient'
const Auth = dynamic(() => import('../components/Auth'), { ssr: false })

const VoiceTutor = dynamic(() => import('../components/VoiceTutor'), { ssr: false })
const RecorderUpload = dynamic(() => import('../components/RecorderUpload'), { ssr: false })
const Whiteboard = dynamic(() => import('../components/Whiteboard'), { ssr: false })

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [conversations, setConversations] = useState([]) // [{id,title,messages,createdAt}]
  const [selectedId, setSelectedId] = useState(null)
  const [initializing, setInitializing] = useState(true)
  const [whiteboardOpen, setWhiteboardOpen] = useState(false)

  // Toggle whiteboard with the `W` key (ignore when typing in inputs)
  useEffect(() => {
    const handler = (e) => {
      try {
        if (!e.key) return
        if (e.key.toLowerCase() !== 'w') return
        const target = e.target
        const tag = target && target.tagName && target.tagName.toUpperCase()
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
        setWhiteboardOpen((s) => !s)
      } catch (err) {
        console.warn('whiteboard toggle handler error', err)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
  const messagesRef = useRef(null)
  const whiteboardImageRef = useRef(null)
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
    } catch (e) { }
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
    } catch (e) { }
  }, [conversations, selectedId])

  const handleTranscript = (text) => {
    const entry = { role: 'user', text, _local: true }
    setConversations((list) => list.map((c) => c.id === selectedId ? { ...c, messages: [...c.messages, entry] } : c))
  }

  // send transcript to backend chat endpoint and append Gemini reply
  const handleTranscriptAndChat = async (text) => {
    if (!text) return
    console.log('handleTranscriptAndChat starting', { text, selectedId })
    const userEntry = { role: 'user', text }
    const pendingAssistant = { role: 'assistant', text: 'Thinking...', _pending: true }
    // if a local placeholder exists as the last user message, replace it
    setConversations((list) => {
      console.log('setConversations (pending update)', { selectedId, listLen: list.length })
      return list.map((c) => {
        if (c.id !== selectedId) return c
        const last = c.messages[c.messages.length - 1]
        let msgs = c.messages
        if (last && last.role === 'user' && last._local) {
          msgs = [...c.messages.slice(0, -1), userEntry, pendingAssistant]
        } else {
          msgs = [...c.messages, userEntry, pendingAssistant]
        }
        return { ...c, messages: msgs }
      })
    })

    try {
      const conv = getSelectedConversation()
      const payload = { text }
      if (conv?.geminiSessionId) payload.session_id = conv.geminiSessionId
      console.log('proxy /api/proxy-chat sending payload', payload)
      const controller = new AbortController()
      const timeoutMs = 25000
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      let res
      try {
        // include whiteboard image if present on the selected conversation or transient ref
        let imageBase64 = conv?.whiteboardImageBase64 || null
        let imageContentType = conv?.whiteboardImageContentType || null
        if (!imageBase64 && whiteboardImageRef.current?.id === selectedId) {
          imageBase64 = whiteboardImageRef.current.raw
          imageContentType = whiteboardImageRef.current.contentType
        }

        const endpoint = imageBase64 ? '/api/proxy-chat-image' : '/api/proxy-chat'
        if (imageBase64) {
          payload.image_base64 = imageBase64
          payload.image_content_type = imageContentType || 'image/png'
        }

        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`Server ${res.status}: ${txt}`)
      }
      const data = await res.json().catch(() => ({}))
      console.log('proxy /api/proxy-chat response:', data)
      const reply = data?.response || data?.transcription || data?.text || ''
      const final = reply && reply.trim() ? reply : '[no reply]'

      // replace the pending assistant message with final reply and save gemini session id if provided
      const sessionId = data?.session_id || data?.session || data?.gemini_session_id || data?.sessionId || null
      setConversations((list) => {
        console.log('setConversations (final update)', { selectedId, reply: final })
        return list.map((c) => {
          if (c.id !== selectedId) return c
          const msgs = c.messages.map((m) => m._pending ? ({ role: 'assistant', text: final }) : m)
          return { ...c, messages: msgs, geminiSessionId: sessionId || c.geminiSessionId }
        })
      })

      // Auto-play assistant reply TTS
      try { playAssistantAudio(final) } catch (e) { console.warn('Auto-play failed', e) }
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

  // Audio playback state
  const [playingUrl, setPlayingUrl] = useState(null)
  const audioRef = useRef(null)
  const [playingText, setPlayingText] = useState(null)
  const [ttsLoadingText, setTtsLoadingText] = useState(null)

  const playAssistantAudio = async (text) => {
    if (!text) return
    // provide immediate UI feedback
    setTtsLoadingText(text)
    try {
      // stop any existing playback
      try { audioRef.current?.pause?.(); URL.revokeObjectURL(playingUrl) } catch (e) { }
      setPlayingUrl(null)
      setPlayingText(null)

      const controller = new AbortController()
      const timeoutMs = 30000
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
      let res
      try {
        res = await fetch('/api/proxy-speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeoutId)
      }

      if (!res.ok) {
        const txt = await res.text().catch(() => '')
        throw new Error(`TTS server ${res.status}: ${txt}`)
      }

      const ct = res.headers.get('content-type') || ''
      if (!ct.includes('audio')) {
        // Try to parse JSON and look for common audio fields (audio_base64, audio, audio_url)
        let json = null
        try {
          json = await res.json()
        } catch (e) {
          const textResp = await res.text().catch(() => '')
          console.warn('TTS proxy returned non-audio response (text):', textResp)
          alert('TTS not available: server returned no audio')
          return
        }

        // helper: convert base64 to blob
        const base64ToBlob = (b64, mime) => {
          const byteChars = atob(b64)
          const byteNumbers = new Array(byteChars.length)
          for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i)
          const byteArray = new Uint8Array(byteNumbers)
          return new Blob([byteArray], { type: mime || 'audio/mpeg' })
        }

        // check fields
        const b64 = json?.audio_base64 || json?.audio || json?.audio_b64
        const urlField = json?.audio_url || json?.tts_url || json?.url
        if (b64) {
          const blob = base64ToBlob(b64, json?.content_type || 'audio/mpeg')
          const url = URL.createObjectURL(blob)
          setPlayingUrl(url)
          setPlayingText(text)
          const a = new Audio(url)
          audioRef.current = a
          a.play().finally(() => {
            a.addEventListener('ended', () => {
              try { URL.revokeObjectURL(url) } catch (e) { }
              setPlayingUrl(null)
              setPlayingText(null)
            })
          })
          return
        } else if (urlField) {
          // fetch that URL and play
          try {
            const audioRes = await fetch(urlField)
            if (!audioRes.ok) throw new Error('Could not fetch audio URL')
            const buf2 = await audioRes.arrayBuffer()
            const blob2 = new Blob([buf2], { type: audioRes.headers.get('content-type') || 'audio/mpeg' })
            const url2 = URL.createObjectURL(blob2)
            setPlayingUrl(url2)
            setPlayingText(text)
            const a2 = new Audio(url2)
            audioRef.current = a2
            a2.play().finally(() => {
              a2.addEventListener('ended', () => {
                try { URL.revokeObjectURL(url2) } catch (e) { }
                setPlayingUrl(null)
                setPlayingText(null)
              })
            })
            return
          } catch (e) {
            console.error('Error fetching audio_url from backend', e)
            alert('TTS not available: could not fetch audio URL')
            return
          }
        }

        console.warn('TTS proxy returned JSON without audio fields:', json)
        alert('TTS not available: server returned no audio')
        return
      }

      // If the response is a streaming audio body and the browser supports MediaSource,
      // stream chunks into a MediaSource for earlier playback start.
      try {
        const isMSESupported = typeof window !== 'undefined' && 'MediaSource' in window
        if (isMSESupported && res.body) {
          const mime = ct || 'audio/mpeg'
          const mediaSource = new MediaSource()
          const url = URL.createObjectURL(mediaSource)
          setPlayingUrl(url)
          setPlayingText(text)
          const audioEl = new Audio()
          audioRef.current = audioEl
          audioEl.src = url
          audioEl.autoplay = true

          mediaSource.addEventListener('sourceopen', async () => {
            try {
              const sourceBuffer = mediaSource.addSourceBuffer(mime)
              const reader = res.body.getReader()
              const queue = []
              let reading = true

              const appendNext = () => {
                if (queue.length === 0) return
                if (sourceBuffer.updating) return
                const chunk = queue.shift()
                try { sourceBuffer.appendBuffer(chunk) } catch (e) { console.warn('appendBuffer failed', e) }
              }

              // start a small interval to attempt append when possible
              const intId = setInterval(appendNext, 50)

              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                // value is a Uint8Array
                queue.push(value)
                appendNext()
                // start playback once we have some data
                if (audioEl.paused) {
                  try { audioEl.play().catch(() => { }) } catch (e) { }
                }
              }

              clearInterval(intId)
              // wait for pending updates to finish
              const waitForUpdate = () => new Promise((resolve) => {
                if (!sourceBuffer.updating) return resolve()
                const onUpd = () => { if (!sourceBuffer.updating) { sourceBuffer.removeEventListener('updateend', onUpd); resolve() } }
                sourceBuffer.addEventListener('updateend', onUpd)
              })
              await waitForUpdate()
              try { mediaSource.endOfStream() } catch (e) { }
            } catch (e) {
              console.warn('MediaSource streaming failed', e)
              try { mediaSource.endOfStream() } catch (ee) { }
            }
          })

          // cleanup handlers
          audioEl.addEventListener('ended', () => {
            try { URL.revokeObjectURL(url) } catch (e) { }
            setPlayingUrl(null)
            setPlayingText(null)
          })
          return
        }
      } catch (e) {
        console.warn('Streaming attempt failed, falling back to full-buffer playback', e)
      }

      // Fallback: fully buffer then play
      const buf = await res.arrayBuffer()
      const blob = new Blob([buf], { type: ct })
      const url = URL.createObjectURL(blob)
      setPlayingUrl(url)
      setPlayingText(text)
      const a = new Audio(url)
      audioRef.current = a
      a.play().finally(() => {
        // cleanup when finished
        a.addEventListener('ended', () => {
          try { URL.revokeObjectURL(url) } catch (e) { }
          setPlayingUrl(null)
          setPlayingText(null)
        })
      })
    } catch (e) {
      console.error('TTS playback error', e)
      alert('TTS playback error: ' + (e.message || String(e)))
    } finally {
      setTtsLoadingText(null)
    }
  }

  const stopAssistantAudio = () => {
    try { audioRef.current?.pause?.(); } catch (e) { }
    try { if (playingUrl) URL.revokeObjectURL(playingUrl) } catch (e) { }
    audioRef.current = null
    setPlayingUrl(null)
    setPlayingText(null)
    setTtsLoadingText(null)
  }

  const createConversation = (title) => {
    const conv = { id: `c-${Date.now()}`, title: title || `Conversation ${conversations.length + 1}`, messages: [], createdAt: Date.now(), geminiSessionId: null }
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
        const conv = { id: `c-${Date.now()}`, title: 'Conversation 1', messages: [], createdAt: Date.now(), geminiSessionId: null }
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
                <button onClick={() => router.push('/')} className="px-3 py-1 bg-slate-800 rounded-md text-sm">Home</button>
                <button onClick={() => renameConversation(selectedId)} className="px-3 py-1 bg-slate-800 rounded-md text-sm" disabled={!selectedId}>Rename</button>
                <button onClick={() => deleteConversation(selectedId)} className="px-3 py-1 bg-rose-600 rounded-md text-sm" disabled={!selectedId}>Delete</button>
                <button onClick={() => setWhiteboardOpen(true)} className="px-3 py-1 bg-primary rounded-md text-slate-900 text-sm">Whiteboard</button>
              </div>
            </header>

            <section className="mt-6 bg-slate-800 rounded-lg p-4 h-[640px]">
              <div ref={messagesRef} className="h-full overflow-y-auto pr-2 flex flex-col gap-3">
                {getSelectedConversation()?.messages?.map((m, i) => {
                  const firstName = (user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || 'You')?.split?.(' ')[0] || 'You'
                  const label = m.role === 'user' ? firstName : (m.role === 'assistant' ? 'Clueless Learner' : m.role)
                  return (
                    <div key={i} className={`p-3 rounded-md ${m.role === 'user' ? 'bg-slate-700 text-slate-100 self-end' : 'bg-slate-700/60 text-slate-200'}`}>
                      <div className="flex items-center justify-between">
                        <div className="text-sm"><strong>{label}</strong></div>
                        {m.role === 'assistant' && (
                          <div className="ml-4 flex items-center gap-2">
                            <button
                              onClick={() => playAssistantAudio(m.text)}
                              className="px-2 py-1 bg-slate-700/40 rounded text-xs"
                              aria-label="Play assistant audio"
                              disabled={ttsLoadingText === m.text}
                            >
                              {ttsLoadingText === m.text ? 'Loading…' : (playingText === m.text ? 'Playing…' : 'Play')}
                            </button>
                            {playingText === m.text && (
                              <button
                                onClick={stopAssistantAudio}
                                className="px-2 py-1 bg-rose-600 rounded text-xs"
                                aria-label="Stop assistant audio"
                              >
                                Stop
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="mt-1">{m.text}</div>
                    </div>
                  )
                })}
              </div>
            </section>

            <footer className="mt-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <RecorderUpload endpoint="/api/proxy-transcribe" onTranscribed={(txt) => {
                    // Upload via same-origin proxy to avoid CORS and keep conversion
                    handleTranscriptAndChat(txt)
                  }} />
                </div>
              </div>
            </footer>
            {whiteboardOpen && (
              <Whiteboard
                initialImage={getSelectedConversation()?.whiteboardImage}
                onClose={(imgData) => {
                  setWhiteboardOpen(false)
                  if (imgData && selectedId) {
                    // imgData is a data URL like: data:image/png;base64,AAAA...
                    let raw = imgData
                    let contentType = null
                    try {
                      const m = imgData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/)
                      if (m) {
                        contentType = m[1]
                        raw = m[2]
                      }
                    } catch (e) {
                      console.warn('could not parse whiteboard data URL', e)
                    }

                    // set in-memory ref for immediate availability to chat sender
                    whiteboardImageRef.current = { id: selectedId, raw, contentType: contentType || 'image/png', dataUrl: imgData }

                    setConversations((list) => list.map((c) => c.id === selectedId ? ({
                      ...c,
                      whiteboardImage: imgData,
                      whiteboardImageBase64: raw,
                      whiteboardImageContentType: contentType || 'image/png'
                    }) : c))
                  }
                }}
                onSave={(imgData) => {
                  if (imgData && selectedId) {
                    let raw = imgData
                    let contentType = null
                    try {
                      const m = imgData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/)
                      if (m) {
                        contentType = m[1]
                        raw = m[2]
                      }
                    } catch (e) {
                      console.warn('could not parse whiteboard data URL on save', e)
                    }
                    whiteboardImageRef.current = { id: selectedId, raw, contentType: contentType || 'image/png', dataUrl: imgData }
                    setConversations((list) => list.map((c) => c.id === selectedId ? ({
                      ...c,
                      whiteboardImage: imgData,
                      whiteboardImageBase64: raw,
                      whiteboardImageContentType: contentType || 'image/png'
                    }) : c))
                  }
                }}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
