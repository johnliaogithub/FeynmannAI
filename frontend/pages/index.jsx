import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import Auth from '../components/Auth'

const VoiceTutor = dynamic(() => import('../components/VoiceTutor'), { ssr: false })

export default function Home() {
  const [conversation, setConversation] = useState([])
  const [user, setUser] = useState(null)

  const router = useRouter()

  useEffect(() => {
    if (user) router.push('/dashboard')
  }, [user, router])

  const handleTranscript = (text) => {
    const entry = { role: 'user', text }
    setConversation((c) => [...c, entry])
  }

  return (
    <main className="container">
      <section className="hero">
        <div className="heroInner">
          <h1 className="title">FeynmanAI</h1>
          <p className="tagline">Practice explaining ideas aloud and get guiding questions to sharpen your understanding.</p>

          <div className="cta">
            <Auth onUser={setUser} redirectTo="/dashboard" />
            <button className="secondary" onClick={() => router.push('/dashboard')}>Open Dashboard</button>
          </div>

          <div className="features">
            <div className="feature">
              <strong>Speak naturally</strong>
              <div style={{ marginTop: 8, color: '#475569' }}>Use your voice to explain a concept — FeynmanAI listens.</div>
            </div>
            <div className="feature">
              <strong>Clarifying questions</strong>
              <div style={{ marginTop: 8, color: '#475569' }}>Get targeted questions that reveal gaps in your explanation.</div>
            </div>
            <div className="feature">
              <strong>Save conversations</strong>
              <div style={{ marginTop: 8, color: '#475569' }}>Multiple conversation slots let you track practice sessions.</div>
            </div>
          </div>
        </div>

        <div className="heroGraphic">🎙️</div>
      </section>

      {user && (
        <section style={{ marginTop: 28 }} className="panel">
          <h3>Quick start</h3>
          <p style={{ color: '#475569' }}>Click Start and speak. The AI will respond with clarifying questions.</p>
          <div style={{ marginTop: 12 }}>
            <VoiceTutor onTranscript={handleTranscript} />
          </div>

          <div style={{ marginTop: 16 }}>
            <h4>Recent</h4>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {conversation.map((m, i) => (
                <div key={i}><strong>{m.role}:</strong> {m.text}</div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
