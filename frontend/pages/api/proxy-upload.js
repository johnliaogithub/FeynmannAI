export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  // If running on Vercel, a localhost backend is unreachable — fail fast with guidance.
  if (backend.startsWith('http://127.0.0.1') || backend.startsWith('http://localhost')) {
    console.error('proxy-upload: BACKEND_URL appears to be localhost; set BACKEND_URL in Vercel project settings')
    return res.status(502).json({ error: 'Backend unreachable from Vercel. Set BACKEND_URL environment variable to your backend URL.' })
  }

  try {
    // Stream the incoming request directly to the backend instead of
    // buffering it in memory. This avoids Vercel function size limits
    // and Content-Length header issues.
    const headers = {}
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']

    console.log('proxy-upload: forwarding upload (streaming)', { backend, contentType: req.headers['content-type'] })

    // Forward the Node.js IncomingMessage stream as the fetch body.
    // Do NOT set `content-length` here; let the runtime use chunked transfer.
    // Add a timeout so fetch fails quickly if the backend is unreachable.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    let backendRes
    try {
      backendRes = await fetch(`${backend}/upload-notes/`, {
        method: 'POST',
        headers,
        // Required in Node's fetch when streaming a request body.
        // See: RequestInit.duplex in Node fetch implementations.
        duplex: 'half',
        body: req,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    const ct = backendRes.headers.get('content-type') || ''
    const text = await backendRes.text().catch(() => '')
    console.log('proxy-upload: backend response', { status: backendRes.status, ct, bodyPreview: text && text.slice(0, 200) })

    res.status(backendRes.status)
    if (ct) res.setHeader('content-type', ct)
    return res.send(text)
  } catch (e) {
    console.error('proxy-upload error', {
      name: e && e.name,
      message: e && e.message,
      code: e && e.code,
      stack: e && e.stack && e.stack.slice ? e.stack.slice(0, 1000) : String(e),
    })

    const payload = {
      error: e && e.message ? e.message : String(e),
      name: e && e.name,
      code: e && e.code,
    }

    // If aborted, make that clear
    if (e && e.name === 'AbortError') payload.error = 'Request to backend timed out (15s)'

    return res.status(502).json(payload)
  }
}
