// Debug route: server-side test request to backend /speak/
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = process.env.TRANSCRIBE_BACKEND_URL || 'http://127.0.0.1:8000'
  const url = `${backend}/speak/`
  try {
    console.log('debug-speak: testing backend URL', url)
    const testPayload = { text: 'hello from debug endpoint' }
    const backendRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify(testPayload),
      // allow a reasonable timeout via AbortController if desired later
    })

    const ct = backendRes.headers.get('content-type') || ''
    const status = backendRes.status

    // read a small sample of the body for debugging
    let bodyPreview = null
    try {
      if (ct.includes('application/json')) {
        bodyPreview = await backendRes.text()
      } else if (ct.includes('audio')) {
        // don't buffer large audio: just report length
        const arr = await backendRes.arrayBuffer()
        bodyPreview = `audio bytes: ${arr.byteLength}`
      } else {
        bodyPreview = await backendRes.text()
      }
    } catch (e) {
      bodyPreview = `error reading body: ${String(e)}`
    }

    return res.status(200).json({ backend: url, status, content_type: ct, body_preview: bodyPreview })
  } catch (e) {
    console.error('debug-speak error', { backend: url, error: e && e.stack ? e.stack : String(e) })
    return res.status(502).json({ error: String(e), backend: url })
  }
}
