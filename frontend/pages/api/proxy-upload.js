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
  try {
    // Stream the incoming request directly to the backend instead of
    // buffering it in memory. This avoids Vercel function size limits
    // and Content-Length header issues.
    const headers = {}
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']

    console.log('proxy-upload: forwarding upload (streaming)', { backend, contentType: req.headers['content-type'] })

    // Forward the Node.js IncomingMessage stream as the fetch body.
    // Do NOT set `content-length` here; let the runtime use chunked transfer.
    const backendRes = await fetch(`${backend}/upload-notes/`, {
      method: 'POST',
      headers,
      body: req,
    })

    const ct = backendRes.headers.get('content-type') || ''
    const text = await backendRes.text().catch(() => '')
    console.log('proxy-upload: backend response', { status: backendRes.status, ct, bodyPreview: text && text.slice(0, 200) })

    res.status(backendRes.status)
    if (ct) res.setHeader('content-type', ct)
    return res.send(text)
  } catch (e) {
    console.error('proxy-upload error', e && e.stack ? e.stack : String(e))
    return res.status(502).json({ error: String(e) })
  }
}
