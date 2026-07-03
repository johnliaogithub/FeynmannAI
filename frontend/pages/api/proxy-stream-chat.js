export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method Not Allowed')
  }

  const backend = (process.env.TRANSCRIBE_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

  try {
    const upstream = await fetch(`${backend}/stream-chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    })

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const reader = upstream.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      res.write(decoder.decode(value, { stream: true }))
    }
  } catch (e) {
    console.error('proxy-stream-chat error', e)
    res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`)
  }

  res.end()
}
