// Proxy to forward TTS requests to the local backend to avoid CORS
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = process.env.TRANSCRIBE_BACKEND_URL || 'http://127.0.0.1:8000'
  try {
    console.log('proxy-speak: forwarding to backend', backend + '/speak/')
    const backendRes = await fetch(`${backend}/speak/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })

    const ct = backendRes.headers.get('content-type') || ''
    res.status(backendRes.status)

    // If backend returned audio, stream it back with proper content-type
    if (ct.includes('audio')) {
      const buf = await backendRes.arrayBuffer()
      if (ct) res.setHeader('content-type', ct)
      // send raw buffer
      return res.send(Buffer.from(buf))
    }

    // Otherwise try to forward JSON or text
    if (ct.includes('application/json')) {
      const json = await backendRes.json()
      res.setHeader('content-type', 'application/json')
      return res.json(json)
    } else {
      const text = await backendRes.text()
      if (ct) res.setHeader('content-type', ct)
      return res.send(text)
    }
  } catch (e) {
    console.error('proxy-speak error while contacting backend', { backend: backend + '/speak/', error: e && e.stack ? e.stack : String(e) })
    return res.status(502).json({ error: String(e) })
  }
}
