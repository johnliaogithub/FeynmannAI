// Proxy to forward chat-with-image requests to the backend
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = process.env.TRANSCRIBE_BACKEND_URL || 'http://127.0.0.1:8000'
  try {
    // Build multipart/form-data expected by the backend: fields `text`, optional `session_id`, and `file` upload
    const body = req.body || {}
    const form = new FormData()
    if (typeof body.text === 'string') form.append('text', body.text)
    if (typeof body.session_id === 'string') form.append('session_id', body.session_id)

    if (body.image_base64) {
      // image_base64 should be raw base64 (no data: prefix)
      const raw = body.image_base64
      const contentType = body.image_content_type || 'image/png'
      const buffer = Buffer.from(raw, 'base64')
      // Create a Blob from buffer and append as file. Provide a filename.
      const blob = new Blob([buffer], { type: contentType })
      form.append('file', blob, 'whiteboard.png')
    }

    console.log('proxy-chat-image: forwarding to backend', backend, 'body keys:', Object.keys(body || {}))
    const backendRes = await fetch(`${backend}/chat-with-image/`, {
      method: 'POST',
      body: form,
      // NOTE: do NOT set Content-Type header; fetch will set multipart boundary
    })

    const ct = backendRes.headers.get('content-type') || ''
    const status = backendRes.status
    const text = await backendRes.text().catch(() => '')
    console.log('proxy-chat-image: backend response', { status, ct, bodyPreview: text && text.slice(0, 400) })

    res.status(status)
    if (ct.includes('application/json')) {
      try {
        const json = JSON.parse(text)
        res.setHeader('content-type', 'application/json')
        return res.json(json)
      } catch (e) {
        console.warn('proxy-chat-image: failed to parse backend JSON', e)
        if (ct) res.setHeader('content-type', ct)
        return res.send(text)
      }
    } else {
      if (ct) res.setHeader('content-type', ct)
      return res.send(text)
    }
  } catch (e) {
    console.error('proxy-chat-image error', e)
    return res.status(502).json({ error: String(e) })
  }
}
