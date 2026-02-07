import { useEffect, useRef, useState } from 'react'

export default function VoiceTutor({ onTranscript }) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return
    const recog = new SpeechRecognition()
    recog.lang = 'en-US'
    recog.interimResults = false
    recog.maxAlternatives = 1

    recog.onresult = (e) => {
      const text = e.results[0][0].transcript.trim()
      onTranscript && onTranscript(text)
    }
    recog.onend = () => setListening(false)
    recognitionRef.current = recog
    return () => {
      try { recog.stop && recog.stop() } catch (e) {}
    }
  }, [onTranscript])

  const toggle = () => {
    const r = recognitionRef.current
    if (!r) return alert('SpeechRecognition not supported in this browser.')
    if (listening) {
      r.stop()
      setListening(false)
    } else {
      r.start()
      setListening(true)
    }
  }

  return (
    <div>
      <button onClick={toggle} style={{ padding: '8px 12px' }}>
        {listening ? 'Stop Listening' : 'Start Teaching'}
      </button>
    </div>
  )
}
