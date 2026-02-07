// Probe route: tries multiple backend addresses to find a reachable /speak/ endpoint
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).end('Method Not Allowed')
  }

  const candidates = []
  // Prefer explicit env var (use Vercel env var NEXT_PUBLIC_API_URL or TRANSCRIBE_BACKEND_URL)
  const env = process.env.NEXT_PUBLIC_API_URL || process.env.TRANSCRIBE_BACKEND_URL
  if (env) candidates.push(env.replace(/\/$/, ''))
  else {
    // Derive from incoming request (handles deployed domains) and include common local fallbacks
    const host = req.headers.host || '127.0.0.1:8000'
    const proto = req.headers['x-forwarded-proto'] || req.headers['x-forwarded-protocol'] || (req.connection && req.connection.encrypted ? 'https' : 'http') || 'http'
    candidates.push(`${proto}://${host}`)
    candidates.push('http://127.0.0.1:8000')
    candidates.push('http://localhost:8000')
    candidates.push('http://0.0.0.0:8000')
    candidates.push('http://host.docker.internal:8000')
  }

  const results = {}
  for (const base of candidates) {
    const url = base + '/speak/'
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3000)
      let r
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          body: JSON.stringify({ text: 'probe' }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timeout)
      }
      results[url] = { ok: true, status: r.status, content_type: r.headers.get('content-type') || null }
    } catch (e) {
      results[url] = { ok: false, error: String(e) }
    }
  }

  return res.status(200).json({ probe_time: Date.now(), results })
}
