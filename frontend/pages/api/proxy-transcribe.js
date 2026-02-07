export const config = {
  api: {
    bodyParser: false,
  },
}

// Proxy multipart/form-data uploads to backend /transcribe-audio/ to avoid CORS
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = process.env.TRANSCRIBE_BACKEND_URL || 'http://127.0.0.1:8000'
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const buffer = Buffer.concat(chunks)

    const headers = {}
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']

    const backendRes = await fetch(`${backend}/transcribe-audio/`, {
      method: 'POST',
      headers,
      body: buffer,
    })

    const text = await backendRes.text()
    res.status(backendRes.status)
    const ct = backendRes.headers.get('content-type')
    if (ct) res.setHeader('content-type', ct)
    return res.send(text)
  } catch (e) {
    console.error('proxy-transcribe error', e)
    return res.status(502).json({ error: String(e) })
  }
}
