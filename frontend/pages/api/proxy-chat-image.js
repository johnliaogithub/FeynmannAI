// Proxy to forward chat-with-image requests to the backend
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = (process.env.TRANSCRIBE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
  try {
    // Build multipart/form-data expected by the backend: fields `text`, optional `session_id`, and `file` upload
    const body = req.body || {}
    const form = new FormData()
    if (typeof body.text === 'string') form.append('text', body.text)
    if (typeof body.session_id === 'string') form.append('session_id', body.session_id)

    let backendRes
    if (body.image_base64) {
      // image_base64 should be raw base64 (no data: prefix)
      const raw = body.image_base64
      const contentType = body.image_content_type || 'image/png'
      const fileBuffer = Buffer.from(raw, 'base64')

      // Build multipart body manually to avoid relying on global FormData/Blob
      const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2, 15)
      const delim = `--${boundary}`
      const closeDelim = `--${boundary}--`
      const parts = []

      if (typeof body.text === 'string') {
        parts.push(Buffer.from(`${delim}\r\nContent-Disposition: form-data; name="text"\r\n\r\n${body.text}\r\n`))
      }
      if (typeof body.session_id === 'string') {
        parts.push(Buffer.from(`${delim}\r\nContent-Disposition: form-data; name="session_id"\r\n\r\n${body.session_id}\r\n`))
      }

      // file part
      parts.push(Buffer.from(`${delim}\r\nContent-Disposition: form-data; name="file"; filename="whiteboard.png"\r\nContent-Type: ${contentType}\r\n\r\n`))
      parts.push(fileBuffer)
      parts.push(Buffer.from('\r\n'))

      parts.push(Buffer.from(`${closeDelim}\r\n`))

      const multipartBody = Buffer.concat(parts)

      const forwardUrl = `${backend}/chat-with-image/`
      console.log('proxy-chat-image: forwarding to backend', backend, 'forwardUrl:', forwardUrl, 'body keys:', Object.keys(body || {}))
      backendRes = await fetch(forwardUrl, {
        method: 'POST',
        headers: {
          'content-type': `multipart/form-data; boundary=${boundary}`,
          'content-length': String(multipartBody.length)
        },
        body: multipartBody
      })
    } else {
      const forwardUrl = `${backend}/chat-with-image/`
      console.log('proxy-chat-image: forwarding to backend (text-only)', backend, 'forwardUrl:', forwardUrl, 'body keys:', Object.keys(body || {}))
      // No file — send as application/json
      backendRes = await fetch(forwardUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: body.text, session_id: body.session_id })
      })
    }

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
