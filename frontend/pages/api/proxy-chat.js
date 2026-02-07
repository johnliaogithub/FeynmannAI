// Simple proxy to forward chat requests to the local backend to avoid CORS issues
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = process.env.TRANSCRIBE_BACKEND_URL || 'http://127.0.0.1:8000'
  try {
    const targetUrl = `${backend}/chat/`
    console.log('Proxying chat request to:', targetUrl)
    const backendRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      // don't send incoming cookies by default
    })

    // attempt to parse JSON responses so the client receives proper JSON
    const ct = backendRes.headers.get('content-type') || ''
    const status = backendRes.status
    res.status(status)
    if (ct.includes('application/json')) {
      const json = await backendRes.json()
      console.log('proxy-chat forwarding JSON:', json)
      res.setHeader('content-type', 'application/json')
      return res.json(json)
    } else {
      const text = await backendRes.text()
      console.log('proxy-chat forwarding text:', text)
      if (ct) res.setHeader('content-type', ct)
      return res.send(text)
    }
  } catch (e) {
    console.error('proxy-chat error', e)
    return res.status(502).json({ error: String(e) })
  }
}
