import '../styles/globals.css'
import { useEffect } from 'react'

import { useRouter } from 'next/router'

export default function App({ Component, pageProps }) {
  const router = useRouter()

  useEffect(() => {
    // default to dark theme like ChatGPT
    document.documentElement.classList.add('dark')

    // Debugging redirects
    const handleStart = (url) => console.log('App: Route Change Start:', url)
    const handleComplete = (url) => console.log('App: Route Change Complete:', url)

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleComplete)

    const handleUnload = () => {
      console.log('App: Page Unloading (Refresh/Nav) from:', window.location.href)
    }
    window.addEventListener('beforeunload', handleUnload)

    return () => {
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleComplete)
      window.removeEventListener('beforeunload', handleUnload)
    }
  }, [router])

  return <Component {...pageProps} />
}
