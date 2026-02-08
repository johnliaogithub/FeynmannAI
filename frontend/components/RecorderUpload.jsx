import { useState, useRef, useEffect } from 'react'

function extensionForMime(mime) {
  if (!mime) return 'webm'
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3'
  if (mime.includes('wav')) return 'wav'
  if (mime.includes('m4a') || mime.includes('mp4')) return 'm4a'
  if (mime.includes('webm')) return 'webm'
  if (mime.includes('ogg')) return 'ogg'
  return 'webm'
}

export default function RecorderUpload({ endpoint = '/api/proxy-transcribe', onTranscribed, onRecordingStart, compact = false, hideStatus = false }) {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const chunksRef = useRef([])
  const mediaRef = useRef(null)
  const mimeRef = useRef('')
  const recognitionRef = useRef(null)
  const finalTranscriptRef = useRef('')

  async function convertBlobToWav(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer()
      const audioCtx = new (window.OfflineAudioContext || window.AudioContext)(1, 44100, 44100)
      const decoded = await audioCtx.decodeAudioData(arrayBuffer)
      const numChannels = decoded.numberOfChannels
      const sampleRate = decoded.sampleRate
      const length = decoded.length * numChannels * 2 + 44
      const buffer = new ArrayBuffer(length)
      const view = new DataView(buffer)

      /* RIFF identifier */ writeString(view, 0, 'RIFF')
      /* file length */ view.setUint32(4, 36 + decoded.length * numChannels * 2, true)
      /* RIFF type */ writeString(view, 8, 'WAVE')
      /* format chunk identifier */ writeString(view, 12, 'fmt ')
      /* format chunk length */ view.setUint32(16, 16, true)
      /* sample format (raw) */ view.setUint16(20, 1, true)
      /* channel count */ view.setUint16(22, numChannels, true)
      /* sample rate */ view.setUint32(24, sampleRate, true)
      /* byte rate (sampleRate * blockAlign) */ view.setUint32(28, sampleRate * numChannels * 2, true)
      /* block align (channel count * bytesPerSample) */ view.setUint16(32, numChannels * 2, true)
      /* bits per sample */ view.setUint16(34, 16, true)
      /* data chunk identifier */ writeString(view, 36, 'data')
      /* data chunk length */ view.setUint32(40, decoded.length * numChannels * 2, true)

      // write interleaved PCM
      let offset = 44
      const interleaved = interleave(decoded)
      for (let i = 0; i < interleaved.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, interleaved[i]))
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      }

      return new Blob([view.buffer], { type: 'audio/wav' })
    } catch (e) {
      console.warn('WAV conversion failed', e)
      return null
    }
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i))
    }
  }

  function interleave(audioBuffer) {
    // interleave channels into single Float32Array
    const channels = []
    for (let i = 0; i < audioBuffer.numberOfChannels; i++) channels.push(audioBuffer.getChannelData(i))
    const length = audioBuffer.length
    if (channels.length === 1) return channels[0]
    const result = new Float32Array(length * channels.length)
    let index = 0
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < channels.length; ch++) {
        result[index++] = channels[ch][i]
      }
    }
    return result
  }

  const start = async () => {
    if (!navigator.mediaDevices || !window.MediaRecorder) return alert('Recording not supported in this browser')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // pick a reasonable mime type: try MP3 first, then webm/ogg
      let mime = ''
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/mpeg')) mime = 'audio/mpeg'
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus'
      else if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mime = 'audio/ogg;codecs=opus'
      else mime = ''

      mimeRef.current = mime
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
      // Notify parent that recording is starting (so TTS can be stopped)
      try { onRecordingStart && onRecordingStart() } catch (e) {}
      mr.onstop = async () => {
        const rawBlob = new Blob(chunksRef.current, { type: mimeRef.current || 'audio/webm' })
        // try to convert to WAV for better backend compatibility, but don't block too long
        let uploadable = null
        try {
          const wav = await convertBlobToWavWithTimeout(rawBlob, 3000)
          if (wav) uploadable = wav
        } catch (e) { console.warn('convert failed or timed out', e) }
        if (!uploadable) uploadable = rawBlob
        await uploadBlob(uploadable)
        try { stream.getTracks().forEach(t => t.stop()) } catch(e){}
      }
      mediaRef.current = mr
      mr.start()
      setRecording(true)
      setMessage('Recording…')

      // start SpeechRecognition in parallel as a local fallback
      try {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
        if (SpeechRecognition) {
          const recog = new SpeechRecognition()
          recog.continuous = true
          recog.interimResults = false
          recog.lang = 'en-US'
          finalTranscriptRef.current = ''
          recog.onresult = (ev) => {
            for (let i = ev.resultIndex; i < ev.results.length; ++i) {
              if (ev.results[i].isFinal) {
                finalTranscriptRef.current += (ev.results[i][0].transcript || '')
              }
            }
          }
          recog.onerror = (e) => {
            console.warn('SpeechRecognition error', e)
          }
          recognitionRef.current = recog
          try { recog.start() } catch (e) {}
        }
      } catch (e) {
        console.warn('No SpeechRecognition available', e)
      }
    } catch (e) {
      console.error(e)
      alert('Could not start recording: ' + String(e))
    }
  }

  const stop = () => {
    const mr = mediaRef.current
    if (!mr) return
    try { mr.stop() } catch(e){}
    setRecording(false)
    setMessage('Processing…')

    // stop local SpeechRecognition if running
    try {
      const r = recognitionRef.current
      if (r) {
        try { r.stop() } catch(e){}
      }
    } catch (e) {}
  }

  // allow Enter key to toggle recording (unless focused in an input/textarea/contenteditable)
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== 'Enter') return
      const target = e.target
      const tag = target && target.tagName && target.tagName.toUpperCase()
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      e.preventDefault()
      try {
        if (recording) stop()
        else start()
      } catch (err) {
        console.warn('toggle recording failed', err)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [recording])

  async function uploadBlob(blob) {
    setUploading(true)
    setMessage('Uploading…')
    try {
      const ext = extensionForMime(blob.type)
      const file = new File([blob], `recording.${ext}`, { type: blob.type })
      const fd = new FormData()
      fd.append('file', file)

      // use AbortController to avoid hanging uploads
      // Use a longer timeout for uploads and retry once on abort
      const tryUpload = async () => {
        const controller = new AbortController()
        const timeoutMs = 120000 // 2 minutes
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
        let res
        try {
          res = await fetch(endpoint, { method: 'POST', body: fd, signal: controller.signal })
          return res
        } finally {
          clearTimeout(timeoutId)
        }
      }

      let res
      try {
        res = await tryUpload()
      } catch (e) {
        // retry once if aborted
        if (e && e.name === 'AbortError') {
          console.warn('Upload aborted — retrying once')
          try {
            res = await tryUpload()
          } catch (err2) {
            throw err2
          }
        } else throw e
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        console.error('Upload error', text)
        // fallback to local SpeechRecognition transcript if available
        const local = finalTranscriptRef.current && finalTranscriptRef.current.trim()
        if (local) {
          setMessage('Upload failed — using local transcript')
          onTranscribed && onTranscribed(local)
        } else {
          setMessage('Upload failed: ' + res.status)
        }
        setUploading(false)
        return
      }

      // assume backend returns JSON { transcription: '...' } or text
      let data
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) data = await res.json()
      else data = { transcription: await res.text() }

      const txt = data?.transcription || data?.text || (typeof data === 'string' ? data : '')
      if (txt && txt.trim()) {
        setMessage('Transcription received')
        onTranscribed && onTranscribed(txt)
      } else {
        // server responded but no transcription — use local if available
        const local = finalTranscriptRef.current && finalTranscriptRef.current.trim()
        if (local) {
          setMessage('No server transcription — using local transcript')
          onTranscribed && onTranscribed(local)
        } else {
          setMessage('No transcription available')
        }
      }
    } catch (e) {
      console.error(e)
      // on error, fallback to local SpeechRecognition transcript if present
      const local = finalTranscriptRef.current && finalTranscriptRef.current.trim()
      if (local) {
        setMessage('Upload error — using local transcript')
        onTranscribed && onTranscribed(local)
      } else {
        setMessage(e.name === 'AbortError' ? 'Upload timed out' : 'Upload error')
      }
    } finally {
      setUploading(false)
      setTimeout(() => setMessage(''), 2500)
    }
  }

  // Attempt WAV conversion but give up after `ms` milliseconds and return null
  function convertBlobToWavWithTimeout(blob, ms = 3000) {
    return new Promise((resolve, reject) => {
      let settled = false
      const to = setTimeout(() => {
        if (settled) return
        settled = true
        reject(new Error('WAV conversion timeout'))
      }, ms)
      convertBlobToWav(blob).then((res) => {
        if (settled) return
        settled = true
        clearTimeout(to)
        resolve(res)
      }).catch((err) => {
        if (settled) return
        settled = true
        clearTimeout(to)
        reject(err)
      })
    })
  }

  return (
    <div className="h-full">
      <div className="flex items-center justify-between h-full">
        <div className="flex-1 flex flex-col items-start h-full justify-center">
          {!recording ? (
            <button
              onClick={start}
              className={compact ? "px-5 py-3 bg-primary rounded-md text-slate-900 font-semibold text-lg min-w-[120px]" : "w-full h-full flex items-center justify-center px-6 py-3 bg-primary rounded-md text-slate-900 text-lg font-semibold shadow"}
            >
              {compact ? 'Record' : 'Click here or press enter to start recording'}
            </button>
            ) : (
            <button
              onClick={stop}
              className={compact ? "px-5 py-3 bg-rose-500 rounded-md text-white font-semibold text-lg min-w-[120px]" : "w-full h-full flex items-center justify-center px-6 py-3 bg-rose-500 rounded-md text-white text-lg font-semibold shadow"}
            >
              {compact ? 'Stop' : 'Stop'}
            </button>
          )}
          {!hideStatus && (
            <div className="mt-2 text-sm text-slate-400">{uploading ? 'Uploading…' : message}</div>
          )}
          {/* helper text removed — label shown on button */}
        </div>
        {/* Cancel button removed per request */}
      </div>
    </div>
  )
}
