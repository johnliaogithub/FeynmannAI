export default async function handler(req, res) {
  const { code, error, error_description } = req.query

  if (error) {
    return res.redirect(`/?error=${encodeURIComponent(error)}&error_description=${encodeURIComponent(error_description || '')}`)
  }

  const clientRedirect = req.query.redirect_to || '/dashboard'

  if (!code) {
    // Some providers (or configurations) return tokens in the URL fragment
    // (after the `#`) which is not sent to the server. In that case, serve
    // a tiny HTML page which reads the fragment on the client and redirects
    // the browser to the app with the fragment preserved so the frontend
    // can pick up the `access_token` and `refresh_token`.
    const clientRedirectFallback = clientRedirect || '/dashboard'

    // Determine the base URL from the request headers if the env var is not set
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const defaultUrl = host ? `${protocol}://${host}` : null

    // Prioritize the URL from headers so Vercel previews work even if NEXT_PUBLIC_APP_URL is set to localhost
    const appUrl = (defaultUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
    console.log('Auth callback debug:', { headers: req.headers, defaultUrl, appUrl, envUrl: process.env.NEXT_PUBLIC_APP_URL })
    const forwardUrl = `${appUrl}${clientRedirectFallback}`
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Auth callback</title></head><body>
    <p>Processing sign-in… If you are not redirected, <a id="link" href="${forwardUrl}">continue</a>.</p>
    <script>
      (function(){
        try {
          const hash = window.location.hash || '';
          // If there is a fragment (access_token etc), redirect to app preserving it
          if (hash && hash.length > 1) {
            window.location.replace('${forwardUrl}' + hash);
          } else {
            // No fragment — just go back to frontend without hash
            window.location.replace('${forwardUrl}');
          }
        } catch (e) {
          document.getElementById('link').style.display = 'inline';
        }
      })();
    </script>
    </body></html>`
    res.setHeader('Content-Type', 'text/html')
    return res.status(200).send(html)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE config')
    return res.status(500).send('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
  }

  try {
    const tokenUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/token`
    const body = new URLSearchParams()
    body.append('grant_type', 'authorization_code')
    body.append('code', code)
    // include redirect_to if provided by the initial sign-in
    if (req.query.redirect_to) body.append('redirect_to', req.query.redirect_to)

    const r = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: body.toString()
    })

    const data = await r.json()
    if (!r.ok) {
      console.error('Token exchange failed', data)
      // redirect back with error info
      return res.redirect(`/?error=token_exchange_failed&error_description=${encodeURIComponent(JSON.stringify(data))}`)
    }

    // Redirect to client with tokens in the hash so client-side can set the session
    const hash = `#access_token=${encodeURIComponent(data.access_token || '')}&refresh_token=${encodeURIComponent(data.refresh_token || '')}&expires_in=${encodeURIComponent(data.expires_in || '')}`
    // Determine the base URL from the request headers if the env var is not set
    const protocol = req.headers['x-forwarded-proto'] || 'http'
    const host = req.headers['x-forwarded-host'] || req.headers.host
    const defaultUrl = host ? `${protocol}://${host}` : null

    const redirectTo = `${defaultUrl || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}${clientRedirect}${hash}`

    return res.redirect(redirectTo)
  } catch (e) {
    console.error('Exchange error', e)
    return res.redirect(`/?error=exchange_error&error_description=${encodeURIComponent(String(e))}`)
  }
}
